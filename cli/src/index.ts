import { Connection, Keypair, PublicKey, clusterApiUrl, Cluster, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TokenInstructions } from './instructions';
import { MetadataManager, TokenMetadata } from './metadata';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { question, pressEnterToContinue, closeReadline } from './readline';

dotenv.config();

// Configuration
const config = {
    network: (process.env.SOLANA_NETWORK || 'devnet') as Cluster,
    walletPath: process.env.WALLET_PATH || 'cli/wallet.json',
    rpcUrl: process.env.SOLANA_RPC_URL
};

interface TokenData {
    name: string;
    symbol: string;
    mint: string;
    tokenAccount?: string;
    owner?: string;
    decimals: number;
    initialSupply: number;
    network: string;
    createdAt: string;
}

function getConnection(network: Cluster = 'devnet'): Connection {
    const endpoint = config.rpcUrl || clusterApiUrl(network);
    return new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
    });
}

function loadWalletKey(keyPath: string): Keypair {
    try {
        const loaded = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
        return Keypair.fromSecretKey(new Uint8Array(loaded));
    } catch (error) {
        throw new Error(`Failed to load wallet key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function saveTokenData(data: TokenData, customFileName?: string) {
    try {
        const fileName = customFileName || `${data.name.toLowerCase()}-${data.symbol.toLowerCase()}.json`;
        const tokensDir = path.join(process.cwd(), 'cli', 'tokens');
        
        // Create tokens directory if it doesn't exist
        if (!fs.existsSync(tokensDir)) {
            fs.mkdirSync(tokensDir, { recursive: true });
        }

        const filePath = path.join(tokensDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`\n✅ Token data saved to: ${filePath}`);
    } catch (error) {
        console.error('\n❌ Error saving token data:', error instanceof Error ? error.message : 'Unknown error');
    }
}

async function requestDevnetAirdrop() {
    try {
        console.log('\n=== Request Devnet SOL Airdrop ===');
        
        const walletPath = await question('Enter path to wallet file (default: cli/wallet.json): ') || 'cli/wallet.json';
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection();
        
        console.log(`\nRequesting airdrop for wallet: ${wallet.publicKey.toString()}`);
        
        const currentBalance = await connection.getBalance(wallet.publicKey);
        console.log(`Current balance: ${currentBalance / LAMPORTS_PER_SOL} SOL`);

        const signature = await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
        console.log(`\nAirdrop requested. Signature: ${signature}`);
        console.log('Waiting for confirmation...');
        
        await connection.confirmTransaction(signature, 'confirmed');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const newBalance = await connection.getBalance(wallet.publicKey);
        console.log(`\n✅ Airdrop successful!`);
        console.log(`New balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
        console.error('\n❌ Error requesting airdrop:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    await pressEnterToContinue();
}

async function estimateTransactionCost(connection: Connection, operation: string): Promise<number> {
    // Base transaction fee
    const baseFee = 0.000005;
    
    // Additional costs based on operation
    const additionalCosts = {
        'create_token': 0.0014,  // Token creation + account rent
        'create_metadata': 0.0015,  // Metadata account rent
        'transfer': 0.002,  // Account creation (if needed) + transfer
        'burn': 0.000005,  // Just transaction fee
        'update_metadata': 0.000005  // Just transaction fee
    };

    const rentExemption = await connection.getMinimumBalanceForRentExemption(165);
    const totalCost = baseFee + (additionalCosts[operation as keyof typeof additionalCosts] || 0);
    
    return totalCost;
}

function getExplorerLink(signature: string, network: string): string {
    const baseUrl = 'https://explorer.solana.com';
    const clusterParam = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
    return `${baseUrl}/tx/${signature}${clusterParam}`;
}

async function createToken() {
    console.log('\n=== Create New Token ===');
    console.log('\nThis operation will:');
    console.log('1. Create a new SPL token mint');
    console.log('2. Initialize token metadata');
    console.log('3. Mint initial token supply');
    console.log('\nNote: You will need some SOL to pay for transaction fees\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const name = await question('Enter token name: ');
        const symbol = await question('Enter token symbol (max 10 characters): ');
        const amount = await question('Enter initial supply: ');
        const decimals = await question('Enter decimals (default 9): ') || '9';
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (symbol.length > 10) {
            throw new Error('Symbol must be 10 characters or less');
        }
        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new Error('Initial supply must be a positive number');
        }
        if (isNaN(Number(decimals)) || Number(decimals) < 0 || Number(decimals) > 9) {
            throw new Error('Decimals must be between 0 and 9');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'create_token');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        console.log('Note: Additional costs may apply if recipient accounts need to be created');

        const proceed = await question('\nDo you want to proceed? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const mint = await tokenInstructions.createToken(
            name,
            symbol,
            Number(decimals),
            Number(amount)
        );

        console.log('\n✅ Token created successfully!');
        console.log(`Mint address: ${mint}`);
        console.log(`\nView token: ${getExplorerLink(mint, network)}`);

        const tokenData: TokenData = {
            name,
            symbol,
            mint,
            owner: wallet.publicKey.toString(),
            decimals: Number(decimals),
            initialSupply: Number(amount),
            network,
            createdAt: new Date().toISOString()
        };

        const saveData = await question('\nWould you like to save the token data? (y/n): ');
        if (saveData.toLowerCase() === 'y') {
            const customFileName = await question('Enter custom filename (press Enter for default): ');
            await saveTokenData(tokenData, customFileName || undefined);
        }

    } catch (error) {
        console.error('\n❌ Error creating token:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Make sure your wallet has enough SOL');
        console.log('2. Check your network connection');
        console.log('3. Verify your wallet file is valid');
        console.log('4. Try requesting an airdrop (Option 9)');
    }

    await pressEnterToContinue();
}

async function transferTokens() {
    console.log('\n=== Transfer Tokens ===');
    console.log('\nThis operation will:');
    console.log('1. Transfer tokens from your wallet to another address');
    console.log('2. Create recipient token account if it doesn\'t exist');
    console.log('\nNote: You will need some SOL to pay for transaction fees\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const recipient = await question('Enter recipient wallet address: ');
        const amount = await question('Enter amount to transfer: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (!mint.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid mint address format');
        }
        if (!recipient.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid recipient address format');
        }
        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new Error('Amount must be a positive number');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'transfer');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        console.log('Note: Additional costs may apply if recipient accounts need to be created');

        const proceed = await question('\nDo you want to proceed? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const signature = await tokenInstructions.transferTokens(
            new PublicKey(mint),
            new PublicKey(recipient),
            Number(amount)
        );

        console.log('\n✅ Transfer successful!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error transferring tokens:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Verify you have enough tokens to transfer');
        console.log('2. Check that all addresses are correct');
        console.log('3. Make sure your wallet has enough SOL for fees');
        console.log('4. Confirm you\'re on the correct network');
    }

    await pressEnterToContinue();
}

async function burnTokens() {
    console.log('\n=== Burn Tokens ===');
    console.log('\nThis operation will:');
    console.log('1. Permanently remove tokens from circulation');
    console.log('2. Reduce total supply of the token');
    console.log('\nWARNING: This action cannot be undone!\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const amount = await question('Enter amount to burn: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (!mint.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid mint address format');
        }
        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            throw new Error('Amount must be a positive number');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'burn');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);

        const proceed = await question('\nDo you want to proceed? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const signature = await tokenInstructions.burnTokens(
            new PublicKey(mint),
            Number(amount)
        );

        console.log('\n✅ Tokens burned successfully!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error burning tokens:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Verify you have enough tokens to burn');
        console.log('2. Check that the mint address is correct');
        console.log('3. Make sure your wallet has enough SOL for fees');
        console.log('4. Confirm you\'re on the correct network');
    }

    await pressEnterToContinue();
}

async function checkBalance() {
    console.log('\n=== Check Token Balance ===');
    console.log('\nThis operation will:');
    console.log('1. Query the token balance for a specific wallet');
    console.log('2. Display token metadata if available');
    console.log('\nNote: This is a read-only operation and costs nothing\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (!mint.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid mint address format');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const balanceResult = await tokenInstructions.getTokenBalance(new PublicKey(mint));

        console.log('\nBalance Information:');
        console.log('-------------------');
        console.log(`Token Address: ${mint}`);
        console.log(`Wallet Address: ${wallet.publicKey.toString()}`);
        console.log(`Balance: ${balanceResult} tokens`);
        
        // Try to fetch token metadata
        try {
            const metadataManager = new MetadataManager(connection);
            const metadata = await metadataManager.getTokenMetadata(new PublicKey(mint));
            if (metadata) {
                console.log('\nToken Metadata:');
                console.log('--------------');
                console.log(`Name: ${metadata.name}`);
                console.log(`Symbol: ${metadata.symbol}`);
                console.log(`URI: ${metadata.uri}`);
            }
        } catch (metadataError) {
            console.log('\nNote: No metadata found for this token');
        }

        console.log(`\nView token: https://explorer.solana.com/address/${mint}${network === 'devnet' ? '?cluster=devnet' : ''}`);
    } catch (error) {
        console.error('\n❌ Error checking balance:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Verify the mint address is correct');
        console.log('2. Check that the wallet file is valid');
        console.log('3. Confirm you\'re on the correct network');
        console.log('4. Make sure the token account exists');
    }

    await pressEnterToContinue();
}

async function createMetadata() {
    console.log('\n=== Create Token Metadata ===');
    console.log('\nThis operation will:');
    console.log('1. Create metadata for your token');
    console.log('2. Store metadata on-chain');
    console.log('\nNote: You need to be the token authority to create metadata\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const name = await question('Enter token name: ');
        const symbol = await question('Enter token symbol: ');
        const uri = await question('Enter metadata URI: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (!mint.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid mint address format');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'create_metadata');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);

        const proceed = await question('\nDo you want to proceed? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const metadataManager = new MetadataManager(connection);
        const metadata: TokenMetadata = {
            name,
            symbol,
            uri
        };

        const signature = await metadataManager.createMetadata(
            new PublicKey(mint),
            metadata,
            wallet
        );

        console.log('\n✅ Metadata created successfully!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error creating metadata:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Verify you are the token authority');
        console.log('2. Check that the mint address is correct');
        console.log('3. Make sure your wallet has enough SOL for fees');
        console.log('4. Confirm the metadata URI is accessible');
    }

    await pressEnterToContinue();
}

async function updateMetadata() {
    console.log('\n=== Update Token Metadata ===');
    console.log('\nThis operation will:');
    console.log('1. Update existing token metadata');
    console.log('2. Store new metadata on-chain');
    console.log('\nNote: You need to be the update authority to modify metadata\n');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const name = await question('Enter new token name (or press Enter to skip): ');
        const symbol = await question('Enter new token symbol (or press Enter to skip): ');
        const uri = await question('Enter new metadata URI (or press Enter to skip): ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = networkInput as Cluster;

        // Validate inputs
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        if (!mint.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            throw new Error('Invalid mint address format');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);
        const metadataManager = new MetadataManager(connection);

        // Get existing metadata
        const existingMetadata = await metadataManager.getTokenMetadata(new PublicKey(mint));
        if (!existingMetadata) {
            throw new Error('No existing metadata found for this token');
        }

        // Update only provided fields
        const metadata: TokenMetadata = {
            name: name || existingMetadata.name,
            symbol: symbol || existingMetadata.symbol,
            uri: uri || existingMetadata.uri,
            sellerFeeBasisPoints: existingMetadata.sellerFeeBasisPoints,
            creators: existingMetadata.creators
        };

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'update_metadata');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);

        const proceed = await question('\nDo you want to proceed? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const signature = await metadataManager.updateMetadata(
            new PublicKey(mint),
            metadata,
            wallet
        );

        console.log('\n✅ Metadata updated successfully!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error updating metadata:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
        console.log('\nTroubleshooting tips:');
        console.log('1. Verify you are the update authority');
        console.log('2. Check that the mint address is correct');
        console.log('3. Make sure your wallet has enough SOL for fees');
        console.log('4. Confirm the metadata URI is accessible');
        console.log('5. Verify that metadata exists for the token');
    }

    await pressEnterToContinue();
}

async function showHelp() {
    console.log('\n=== Help ===');
    console.log('This application allows you to manage Solana tokens and their metadata.');
    console.log('Available options:');
    console.log('1. Create New Token - Create a new token on the Solana blockchain.');
    console.log('2. Transfer Tokens - Transfer tokens to another wallet.');
    console.log('3. Burn Tokens - Burn a specified amount of tokens.');
    console.log('4. Check Token Balance - Check the balance of a specific token.');
    console.log('5. Create Token Metadata - Create metadata for a token.');
    console.log('6. Update Token Metadata - Update existing metadata for a token.');
    console.log('7. Help - Display this help message.');
    console.log('8. Exit - Exit the application.');
}

async function main() {
    while (true) {
        console.clear();
        console.log('\nWelcome to Solana Token Manager!\n');
        console.log('=== Solana Token Manager ===');
        console.log('1. Create New Token');
        console.log('2. Transfer Tokens');
        console.log('3. Burn Tokens');
        console.log('4. Check Token Balance');
        console.log('5. Create Token Metadata');
        console.log('6. Update Token Metadata');
        console.log('7. Help');
        console.log('8. Exit');
        console.log('9. Request Devnet Airdrop');

        const choice = await question('\nSelect an option (1-9): ');

        try {
            switch (choice) {
                case '1':
                    await createToken();
                    break;
                case '2':
                    await transferTokens();
                    break;
                case '3':
                    await burnTokens();
                    break;
                case '4':
                    await checkBalance();
                    break;
                case '5':
                    await createMetadata();
                    break;
                case '6':
                    await updateMetadata();
                    break;
                case '7':
                    await showHelp();
                    break;
                case '8':
                    console.log('\nGoodbye!');
                    closeReadline();
                    process.exit(0);
                case '9':
                    await requestDevnetAirdrop();
                    break;
                default:
                    console.log('\nInvalid option. Please try again.');
                    await pressEnterToContinue();
            }
        } catch (error) {
            console.error('\n❌ An error occurred:', error instanceof Error ? error.message : 'Unknown error');
            await pressEnterToContinue();
        }
    }
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    closeReadline();
    process.exit(1);
});
