import { Connection, Keypair, PublicKey, clusterApiUrl, Cluster, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getMint, setAuthority, AuthorityType } from '@solana/spl-token';
import { TokenInstructions } from './instructions';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { question, pressEnterToContinue, closeReadline } from './readline';
import { MetadataManager, TokenMetadata } from './metadata';

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
    mintAuthority?: string;
    freezeAuthority?: string;
    network: string;
    createdAt: string;
}

function getConnection(network: Cluster): Connection {
    const endpoint = network === 'mainnet-beta' 
        ? process.env.SOLANA_RPC_URL || clusterApiUrl(network)
        : clusterApiUrl(network);
    
    return new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 120000, // 120 seconds
        wsEndpoint: network === 'mainnet-beta' ? 
            'wss://api.mainnet-beta.solana.com' : undefined,
        httpHeaders: network === 'mainnet-beta' ? {
            'Content-Type': 'application/json',
        } : undefined,
    });
}

async function confirmMainnetOperation(connection: Connection, wallet: Keypair, network: Cluster): Promise<boolean> {
    if (network !== 'mainnet-beta') return true;

    const balance = await connection.getBalance(wallet.publicKey);
    console.log('\n⚠️ MAINNET OPERATION WARNING');
    console.log('----------------------------');
    console.log('You are about to perform an operation on mainnet-beta.');
    console.log('This will use real SOL and affect real tokens.');
    console.log(`Your wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    
    if (balance < LAMPORTS_PER_SOL * 0.1) {
        console.log('\n⚠️ WARNING: Your wallet balance is very low for mainnet operations.');
        console.log('Transaction fees on mainnet require real SOL.');
        console.log('Recommended minimum: 0.1 SOL');
    }

    const confirm = await question('\nType "MAINNET" to confirm this operation: ');
    return confirm === 'MAINNET';
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
        const connection = getConnection('devnet');
        
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
    // Get the current network fee from the connection
    const recentBlockhash = await connection.getLatestBlockhash();
    const baseFee = 5000 / LAMPORTS_PER_SOL; // Default lamports per signature
    
    // Additional costs based on operation and network
    const additionalCosts = {
        'create_token': 0.0025,      // Token creation + account rent + metadata
        'create_metadata': 0.0015,   // Metadata account rent
        'transfer': 0.002,          // Account creation (if needed) + transfer
        'burn': 0.000005,           // Just transaction fee
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

function validateNetwork(network: string): Cluster {
    const validNetworks = ['devnet', 'mainnet-beta', 'testnet'];
    const normalizedNetwork = network.toLowerCase();
    
    if (!validNetworks.includes(normalizedNetwork)) {
        throw new Error(`Invalid network. Please choose from: ${validNetworks.join(', ')}`);
    }
    
    return normalizedNetwork as Cluster;
}

async function createToken() {
    console.log('\n=== Create New Token ===');
    console.log('\nThis operation will:');
    console.log('1. Create a new SPL token mint');
    console.log('2. Initialize token metadata');
    console.log('3. Mint initial token supply');
    console.log('4. Set up mint and freeze authorities');
    console.log('\nNote: You will need some SOL to pay for transaction fees\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const name = await question('Enter token name: ');
        const symbol = await question('Enter token symbol (max 10 characters): ');
        const amount = await question('Enter initial supply: ');
        const decimals = await question('Enter decimals (default 9): ') || '9';
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        
        // Authority options
        console.log('\nAuthority Options:');
        const setMintAuth = await question('Do you want to set a custom mint authority? (y/N): ');
        let mintAuthority: string | undefined;
        if (setMintAuth.toLowerCase() === 'y') {
            mintAuthority = await question('Enter mint authority public key (leave empty to disable minting): ');
        }
        
        const setFreezeAuth = await question('Do you want to set a freeze authority? (y/N): ');
        let freezeAuthority: string | undefined;
        if (setFreezeAuth.toLowerCase() === 'y') {
            freezeAuthority = await question('Enter freeze authority public key (leave empty to disable freezing): ');
        }
        
        network = validateNetwork(networkInput);

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
        
        // Validate authority addresses if provided
        if (mintAuthority && !PublicKey.isOnCurve(new PublicKey(mintAuthority))) {
            throw new Error('Invalid mint authority public key');
        }
        if (freezeAuthority && !PublicKey.isOnCurve(new PublicKey(freezeAuthority))) {
            throw new Error('Invalid freeze authority public key');
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        // Only offer airdrop on devnet
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'create_token');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        if (network === 'mainnet-beta') {
            console.log('\n⚠️ Note: This is a mainnet transaction. It will use real SOL.');
        }

        const proceed = await question(`\nDo you want to proceed with token creation on ${network}? (y/N): `);
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const mint = await tokenInstructions.createToken(
            name,
            symbol,
            Number(decimals),
            Number(amount),
            mintAuthority ? new PublicKey(mintAuthority) : undefined,
            freezeAuthority ? new PublicKey(freezeAuthority) : undefined
        );

        console.log('\n✅ Token created successfully!');
        console.log(`Mint address: ${mint}`);
        console.log(`Network: ${network}`);
        if (mintAuthority) {
            console.log(`Mint authority: ${mintAuthority}`);
        } else {
            console.log('Mint authority: None (minting disabled)');
        }
        if (freezeAuthority) {
            console.log(`Freeze authority: ${freezeAuthority}`);
        } else {
            console.log('Freeze authority: None (freezing disabled)');
        }
        console.log(`\nView token: ${getExplorerLink(mint, network)}`);

        const tokenData: TokenData = {
            name,
            symbol,
            mint,
            owner: wallet.publicKey.toBase58(),
            decimals: Number(decimals),
            initialSupply: Number(amount),
            mintAuthority: mintAuthority?.toString(),
            freezeAuthority: freezeAuthority?.toString(),
            network: config.network,
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
        console.log('4. Ensure authority addresses are valid Solana public keys');
        if (network === 'devnet') {
            console.log('5. Try requesting an airdrop');
        }
    }

    await pressEnterToContinue();
}

async function transferTokens() {
    console.log('\n=== Transfer Tokens ===');
    console.log('\nThis operation will:');
    console.log('1. Transfer tokens to another wallet');
    console.log('2. Create token account for recipient if needed');
    console.log('\nNote: You will need some SOL to pay for transaction fees\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const recipient = await question('Enter recipient wallet address: ');
        const amount = await question('Enter amount to transfer: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        network = validateNetwork(networkInput);

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
        
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'transfer');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        if (network === 'mainnet-beta') {
            console.log('\n⚠️ Note: This is a mainnet transaction. It will use real SOL.');
        }

        const proceed = await question(`\nDo you want to proceed with token transfer on ${network}? (y/N): `);
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const signature = await tokenInstructions.transfer(
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
    console.log('1. Burn specified amount of tokens from your account');
    console.log('\nNote: This operation cannot be undone!\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const amount = await question('Enter amount to burn: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        network = validateNetwork(networkInput);

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
        
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'burn');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        if (network === 'mainnet-beta') {
            console.log('\n⚠️ Note: This is a mainnet transaction. It will use real SOL.');
        }

        const proceed = await question(`\nDo you want to proceed with token burn on ${network}? (y/N): `);
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);
        const signature = await tokenInstructions.burn(
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
        console.log('1. Make sure your wallet has enough SOL');
        console.log('2. Check your token balance');
        console.log('3. Verify the mint address is correct');
        if (network === 'devnet') {
            console.log('4. Try requesting an airdrop');
        }
    }

    await pressEnterToContinue();
}

async function checkBalance() {
    console.log('\n=== Check Token Balance ===');
    console.log('\nThis operation will:');
    console.log('1. Check token balance for a specific mint');
    console.log('2. Display token metadata if available\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        network = validateNetwork(networkInput);

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
        
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
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

async function setTokenMetadata() {
    console.log('\n=== Set Token Metadata ===');
    console.log('\nThis operation will:');
    console.log('1. Create or update token metadata');
    console.log('2. Store metadata on-chain');
    console.log('\nNote: You need to be the mint/update authority\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const name = await question('Enter token name: ');
        const symbol = await question('Enter token symbol: ');
        const uri = await question('Enter metadata URI: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        network = validateNetwork(networkInput);

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
        
        // Check if metadata already exists
        const existingMetadata = await metadataManager.getTokenMetadata(new PublicKey(mint));
        const action = existingMetadata ? 'update' : 'create';

        // Check wallet balance
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`\nWallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, `${action}_metadata`);
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        if (network === 'mainnet-beta') {
            console.log('\n⚠️ Note: This is a mainnet transaction. It will use real SOL.');
        }

        const proceed = await question(`\nDo you want to proceed with metadata ${action} on ${network}? (y/N): `);
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const metadata: TokenMetadata = {
            name,
            symbol,
            uri
        };

        const signature = await metadataManager.setMetadata(
            new PublicKey(mint),
            metadata,
            wallet
        );

        console.log(`\n✅ Metadata ${action}d successfully!`);
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error setting metadata:');
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
    console.log('\nNote: You need to be the update authority\n');
    
    let network: Cluster = 'devnet'; // Initialize with default
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        const name = await question('Enter new token name (or press Enter to skip): ');
        const symbol = await question('Enter new token symbol (or press Enter to skip): ');
        const uri = await question('Enter new metadata URI (or press Enter to skip): ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        network = validateNetwork(networkInput);

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
        
        if (network === 'devnet' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\nWarning: Low wallet balance. You may need to request an airdrop.');
            const requestAirdrop = await question('Would you like to request an airdrop? (y/N): ');
            if (requestAirdrop.toLowerCase() === 'y') {
                await requestDevnetAirdrop();
            }
        } else if (network === 'mainnet-beta' && balance < LAMPORTS_PER_SOL * 0.1) {
            console.log('\n⚠️ Warning: Low wallet balance. Please ensure you have enough SOL for transaction fees.');
            console.log('Mainnet transactions require real SOL. Airdrops are not available on mainnet.');
        }

        // Estimate costs
        const estimatedCost = await estimateTransactionCost(connection, 'update_metadata');
        console.log('\nEstimated costs:');
        console.log(`Transaction fee: ${estimatedCost.toFixed(6)} SOL`);
        if (network === 'mainnet-beta') {
            console.log('\n⚠️ Note: This is a mainnet transaction. It will use real SOL.');
        }

        const proceed = await question(`\nDo you want to proceed with metadata update on ${network}? (y/N): `);
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

async function manageAuthorities() {
    console.log('\n=== Manage Token Authorities ===');
    
    try {
        const walletPath = await question('Enter path to wallet file: ');
        const mint = await question('Enter token mint address: ');
        
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }

        const wallet = loadWalletKey(walletPath);
        const config = JSON.parse(fs.readFileSync('wallet-config.json', 'utf-8'));
        const connection = getConnection(validateNetwork(config.network));
        const mintPubkey = new PublicKey(mint);
        
        // Get current mint info
        const mintInfo = await getMint(connection, mintPubkey);
        console.log('\nCurrent authorities:');
        console.log(`Mint authority: ${mintInfo.mintAuthority?.toBase58() || 'None (minting disabled)'}`);
        console.log(`Freeze authority: ${mintInfo.freezeAuthority?.toBase58() || 'None (freezing disabled)'}`);
        
        console.log('\nSelect action:');
        console.log('1. Disable minting (permanently)');
        console.log('2. Update mint authority');
        console.log('3. Update freeze authority');
        console.log('4. Freeze token account');
        console.log('5. Thaw token account');
        console.log('6. Batch freeze accounts');
        console.log('7. Batch thaw accounts');
        console.log('8. Check account freeze status');
        console.log('9. Back to main menu');
        
        const choice = await question('\nEnter your choice (1-9): ');
        
        switch (choice) {
            case '1': {
                const confirm = await question('\n⚠️ WARNING: This action cannot be undone. Are you sure? (y/N): ');
                if (confirm.toLowerCase() !== 'y') {
                    console.log('Operation cancelled');
                    break;
                }
                const tx = await TokenInstructions.disableMinting(mintPubkey, wallet);
                console.log('\n✅ Minting has been permanently disabled');
                console.log(`Transaction: ${tx}`);
                break;
            }
            case '2': {
                const newAuth = await question('\nEnter new mint authority (leave empty to disable minting): ');
                const newAuthority = newAuth ? new PublicKey(newAuth) : undefined;
                const tx = await TokenInstructions.updateMintAuthority(mintPubkey, wallet, newAuthority);
                console.log('\n✅ Mint authority updated successfully');
                console.log(`Transaction: ${tx}`);
                break;
            }
            case '3': {
                const newAuth = await question('\nEnter new freeze authority (leave empty to disable freezing): ');
                const newAuthority = newAuth ? new PublicKey(newAuth) : undefined;
                const tx = await TokenInstructions.updateFreezeAuthority(mintPubkey, wallet, newAuthority);
                console.log('\n✅ Freeze authority updated successfully');
                console.log(`Transaction: ${tx}`);
                break;
            }
            case '4': {
                const account = await question('\nEnter token account address to freeze: ');
                const accountPubkey = new PublicKey(account);
                
                // Check current status
                const isFrozen = await TokenInstructions.isAccountFrozen(accountPubkey);
                if (isFrozen) {
                    console.log('\n⚠️ Account is already frozen');
                    break;
                }
                
                const tx = await TokenInstructions.freezeAccount(mintPubkey, accountPubkey, wallet);
                console.log('\n✅ Account frozen successfully');
                console.log(`Transaction: ${tx}`);
                break;
            }
            case '5': {
                const account = await question('\nEnter token account address to thaw: ');
                const accountPubkey = new PublicKey(account);
                
                // Check current status
                const isFrozen = await TokenInstructions.isAccountFrozen(accountPubkey);
                if (!isFrozen) {
                    console.log('\n⚠️ Account is not frozen');
                    break;
                }
                
                const tx = await TokenInstructions.thawAccount(mintPubkey, accountPubkey, wallet);
                console.log('\n✅ Account thawed successfully');
                console.log(`Transaction: ${tx}`);
                break;
            }
            case '6': {
                console.log('\nEnter token account addresses to freeze (one per line)');
                console.log('Press Enter twice when done:');
                const accounts: string[] = [];
                while (true) {
                    const account = await question('');
                    if (!account) break;
                    accounts.push(account);
                }
                
                if (accounts.length === 0) {
                    console.log('No accounts provided');
                    break;
                }
                
                const accountPubkeys = accounts.map(acc => new PublicKey(acc));
                const results = await TokenInstructions.batchFreezeAccounts(mintPubkey, accountPubkeys, wallet);
                
                console.log('\nBatch freeze results:');
                if (results.successes.length > 0) {
                    console.log('\n✅ Successfully frozen accounts:');
                    results.successes.forEach((acc: any) => console.log(`- ${acc}`));
                }
                if (results.failures.length > 0) {
                    console.log('\n❌ Failed to freeze accounts:');
                    results.failures.forEach((f: { account: any; error: any; }) => console.log(`- ${f.account}: ${f.error}`));
                }
                break;
            }
            case '7': {
                console.log('\nEnter token account addresses to thaw (one per line)');
                console.log('Press Enter twice when done:');
                const accounts: string[] = [];
                while (true) {
                    const account = await question('');
                    if (!account) break;
                    accounts.push(account);
                }
                
                if (accounts.length === 0) {
                    console.log('No accounts provided');
                    break;
                }
                
                const accountPubkeys = accounts.map(acc => new PublicKey(acc));
                const results = await TokenInstructions.batchThawAccounts(mintPubkey, accountPubkeys, wallet);
                
                console.log('\nBatch thaw results:');
                if (results.successes.length > 0) {
                    console.log('\n✅ Successfully thawed accounts:');
                    results.successes.forEach((acc: any) => console.log(`- ${acc}`));
                }
                if (results.failures.length > 0) {
                    console.log('\n❌ Failed to thaw accounts:');
                    results.failures.forEach((f: { account: any; error: any; }) => console.log(`- ${f.account}: ${f.error}`));
                }
                break;
            }
            case '8': {
                const account = await question('\nEnter token account address to check: ');
                const accountPubkey = new PublicKey(account);
                const isFrozen = await TokenInstructions.isAccountFrozen(accountPubkey);
                console.log(`\nAccount status: ${isFrozen ? '❄️ Frozen' : '🌡️ Not frozen'}`);
                break;
            }
            case '9':
                return;
            default:
                console.log('\n❌ Invalid choice');
        }
    } catch (error) {
        console.error('\n❌ Error managing authorities:');
        console.error(error instanceof Error ? error.message : 'Unknown error');
    }
    
    await pressEnterToContinue();
}

async function mintMoreTokens() {
    console.log('\n=== Mint Additional Tokens ===');
    
    try {
        const walletPath = await question('Enter path to wallet file (mint authority): ');
        const mint = await question('Enter token mint address: ');
        const amount = await question('Enter amount to mint: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = validateNetwork(networkInput);

        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Add mainnet confirmation
        if (!(await confirmMainnetOperation(connection, wallet, network))) {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);

        console.log('\n⚠️ This will mint additional tokens. Please confirm the details:');
        console.log(`Network: ${network}`);
        console.log(`Amount: ${amount}`);
        
        const proceed = await question('\nProceed with minting? (y/N): ');
        if (proceed.toLowerCase() !== 'y') {
            console.log('Operation cancelled');
            return;
        }

        const signature = await tokenInstructions.mintMoreTokens(
            new PublicKey(mint),
            Number(amount),
            wallet
        );

        console.log('\n✅ Tokens minted successfully!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    await pressEnterToContinue();
}

async function disableTokenMinting() {
    console.log('\n=== Disable Token Minting ===');
    console.log('\n⚠️ WARNING: This action cannot be undone!\n');
    
    try {
        const walletPath = await question('Enter path to wallet file (mint authority): ');
        const mint = await question('Enter token mint address: ');
        const networkInput = await question('Enter network (devnet/mainnet-beta) [default: devnet]: ') || 'devnet';
        const network = validateNetwork(networkInput);

        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }

        const wallet = loadWalletKey(walletPath);
        const connection = getConnection(network);

        // Add mainnet confirmation
        if (!(await confirmMainnetOperation(connection, wallet, network))) {
            console.log('Operation cancelled');
            return;
        }

        const tokenInstructions = new TokenInstructions(connection, wallet);

        console.log('\n⚠️ FINAL WARNING');
        console.log('---------------');
        console.log('This will PERMANENTLY disable minting for this token.');
        console.log('Once disabled, you can NEVER mint additional tokens.');
        console.log(`Network: ${network}`);
        console.log(`Mint Address: ${mint}`);

        const proceed = await question('\nAre you absolutely sure? Type "DISABLE MINTING" to confirm: ');
        if (proceed !== 'DISABLE MINTING') {
            console.log('Operation cancelled');
            return;
        }

        const signature = await tokenInstructions.disableMinting(
            new PublicKey(mint),
            wallet
        );

        console.log('\n✅ Minting disabled successfully!');
        console.log(`Transaction signature: ${signature}`);
        console.log(`\nView transaction: ${getExplorerLink(signature, network)}`);
    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    }
    await pressEnterToContinue();
}

async function showHelp() {
    console.clear();
    console.log('\n=== Solana Token Manager Help ===\n');
    
    console.log('Token Operations:');
    console.log('1. Create New Token');
    console.log('   - Create SPL token with custom supply and decimals');
    console.log('   - Set initial token metadata');
    console.log('   - Estimated cost: ~0.00145 SOL\n');
    
    console.log('2. Transfer Tokens');
    console.log('   - Send tokens to any Solana address');
    console.log('   - Automatic account creation if needed');
    console.log('   - Estimated cost: ~0.00205 SOL\n');
    
    console.log('3. Burn Tokens');
    console.log('   - Permanently remove tokens from circulation');
    console.log('   - Requires token owner authorization');
    console.log('   - Estimated cost: ~0.000005 SOL\n');
    
    console.log('4. Check Token Balance');
    console.log('   - View current token holdings');
    console.log('   - Check associated accounts');
    console.log('   - No transaction cost\n');
    
    console.log('Metadata Management:');
    console.log('5. Set Token Metadata');
    console.log('   - Create or update on-chain metadata for your token');
    console.log('   - Support for name, symbol, and URI');
    console.log('   - Estimated cost: ~0.00155 SOL\n');
    
    console.log('Authority Management:');
    console.log('6. Manage Token Authorities');
    console.log('   - Update mint and freeze authorities');
    console.log('   - Freeze or thaw token accounts');
    console.log('   - Estimated cost: varies\n');
    
    console.log('Utility Functions:');
    console.log('7. Request Devnet Airdrop');
    console.log('   - Get free SOL for testing (devnet only)');
    console.log('   - Automatic retry on failure');
    console.log('   - No transaction cost\n');
    
    console.log('General Commands:');
    console.log('8. Help     - Show this help message');
    console.log('9. Exit     - Close the application\n');
    
    console.log('Tips:');
    console.log('- Always test on devnet first');
    console.log('- Keep your wallet file secure');
    console.log('- Verify all transaction details');
    console.log('- Check costs before confirming\n');
    
    await pressEnterToContinue();
}

async function main() {
    console.clear();
    console.log('\n🪙 Welcome to Solana Token Manager 🪙\n');

    while (true) {
        const network = config.network;
        console.log(`\n=== Main Menu (Network: ${network.toUpperCase()}) ===`);
        console.log('1. Create New Token');
        console.log('2. Transfer Tokens');
        console.log('3. Burn Tokens');
        console.log('4. Check Token Balance');
        console.log('5. Set Token Metadata');
        console.log('6. Manage Token Authorities');
        console.log('7. Mint More Tokens');
        console.log('8. Disable Token Minting');
        console.log('9. Request Devnet Airdrop');
        console.log('10. Help');
        console.log('11. Exit');
        console.log('\n');

        const choice = await question('Select an option (1-11): ');
        console.clear();

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
                    await setTokenMetadata();
                    break;
                case '6':
                    await manageAuthorities();
                    break;
                case '7':
                    await mintMoreTokens();
                    break;
                case '8':
                    await disableTokenMinting();
                    break;
                case '9':
                    if (network !== 'devnet') {
                        console.log('\n❌ Airdrop is only available on devnet!');
                        await pressEnterToContinue();
                        break;
                    }
                    await requestDevnetAirdrop();
                    break;
                case '10':
                    await showHelp();
                    break;
                case '11':
                    console.log('\n👋 Thank you for using Solana Token Manager. Goodbye!\n');
                    closeReadline();
                    return;
                default:
                    console.log('\n❌ Invalid option. Please select a number between 1 and 11.');
                    await pressEnterToContinue();
            }
        } catch (error) {
            console.error('\n❌ An error occurred:', error instanceof Error ? error.message : 'Unknown error');
            await pressEnterToContinue();
        }
        console.clear();
    }
}

// Start the application
main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    closeReadline();
    process.exit(1);
});
