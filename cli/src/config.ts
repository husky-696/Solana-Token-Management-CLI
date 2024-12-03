import { Connection, clusterApiUrl, Cluster, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface Config {
    network: 'devnet' | 'mainnet-beta';
    walletPath: string;
    rpcUrl?: string;
    defaultDecimals: number;
    metadata: {
        minImageSize: number;
        maxImageSize: number;
        supportedFormats: string[];
        recommendedDimensions: {
            width: number;
            height: number;
        };
    };
    mainnet: {
        confirmations: number;
        minBalance: number;
        warningThreshold: number;
        maxRetries: number;
    };
}

export interface NetworkFees {
    createToken: number;
    updateMetadata: number;
    transaction: number;
}

export interface NetworkConfig {
    endpoint: string;
    commitment: 'processed' | 'confirmed' | 'finalized';
}

export function getNetworkConfig(network: string = 'devnet'): NetworkConfig {
    const validNetwork = (network === 'mainnet-beta' || network === 'devnet' || network === 'testnet') ? network as Cluster : 'devnet';
    return {
        endpoint: process.env.RPC_URL || clusterApiUrl(validNetwork),
        commitment: 'confirmed'
    };
}

export const config: Config = {
    network: (process.env.SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
    walletPath: process.env.WALLET_PATH || '~/.config/solana/my-token-wallet.json',
    rpcUrl: process.env.SOLANA_RPC_URL || (
        process.env.SOLANA_NETWORK === 'mainnet-beta' 
            ? 'https://api.mainnet-beta.solana.com'
            : 'https://api.devnet.solana.com'
    ),
    defaultDecimals: parseInt(process.env.DEFAULT_TOKEN_DECIMALS || '9'),
    metadata: {
        minImageSize: 1024, // 1KB
        maxImageSize: 5 * 1024 * 1024, // 5MB
        supportedFormats: ['image/jpeg', 'image/png'],
        recommendedDimensions: {
            width: 400,
            height: 400
        }
    },
    mainnet: {
        confirmations: 20, // Wait for more confirmations on mainnet
        minBalance: 0.1, // Minimum SOL required for mainnet operations
        warningThreshold: 0.5, // Show warning if balance is below this
        maxRetries: 3 // Maximum number of retries for mainnet transactions
    }
};

export function getConnection(): Connection {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        wsEndpoint: rpcUrl.replace('https://', 'wss://'),
    });
    return connection;
}

export async function requestAirdrop(connection: Connection, publicKey: PublicKey): Promise<string> {
    try {
        const signature = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature, 'confirmed');
        return signature;
    } catch (error) {
        console.error('Error requesting airdrop:', error);
        throw error;
    }
}

export async function getCurrentFees(): Promise<NetworkFees> {
    try {
        const connection = await getConnection();
        const { feeCalculator } = await connection.getRecentBlockhash();
        const lamportsPerSignature = feeCalculator.lamportsPerSignature;

        let fees: NetworkFees = {
            createToken: 0.05,      // Cost to create a new token
            updateMetadata: 0.002,  // Cost to update token metadata
            transaction: lamportsPerSignature / 1e9 // Convert to SOL
        };

        // Get real-time fee estimates for mainnet
        if (config.network === 'mainnet-beta') {
            try {
                // Try to get real-time fees from Solana
                const response = await axios.get('https://api.solscan.io/chaininfo');
                if (response.data?.data?.avgFee) {
                    const avgNetworkFee = response.data.data.avgFee / 1e9;
                    // Use the higher fee to be safe
                    fees.transaction = Math.max(fees.transaction, avgNetworkFee);
                }

                // Adjust other fees based on current network conditions
                fees.createToken = Math.max(0.1, fees.transaction * 15000);
                fees.updateMetadata = Math.max(0.005, fees.transaction * 800);
            } catch (error) {
                console.warn('Failed to fetch real-time fee estimates, using conservative estimates for mainnet');
                // Use conservative estimates for mainnet
                fees = {
                    createToken: 0.15,      // Higher estimate for mainnet
                    updateMetadata: 0.01,   // Higher estimate for mainnet
                    transaction: 0.00001    // Higher base fee for mainnet
                };
            }
        }

        return fees;
    } catch (error) {
        console.error('Error fetching network fees:', error);
        // Return conservative estimates
        return config.network === 'mainnet-beta' 
            ? {
                createToken: 0.15,
                updateMetadata: 0.01,
                transaction: 0.00001
            }
            : {
                createToken: 0.05,
                updateMetadata: 0.002,
                transaction: 0.000005
            };
    }
}

export async function confirmTransaction(
    connection: Connection,
    signature: string
): Promise<boolean> {
    const confirmations = config.network === 'mainnet-beta' 
        ? config.mainnet.confirmations 
        : 1;

    try {
        const result = await connection.confirmTransaction({
            signature,
            blockhash: (await connection.getLatestBlockhash()).blockhash,
            lastValidBlockHeight: (await connection.getBlockHeight()) + 150
        }, config.network === 'mainnet-beta' ? 'finalized' as 'processed' | 'confirmed' | 'finalized' : 'confirmed' as 'processed' | 'confirmed' | 'finalized');

        return !result.value.err;
    } catch (error) {
        console.error('Error confirming transaction:', error);
        return false;
    }
}

export function validateMetadataImage(size: number, mimeType: string): { valid: boolean; error?: string } {
    if (size < config.metadata.minImageSize) {
        return { valid: false, error: `Image is too small. Minimum size is ${config.metadata.minImageSize / 1024}KB` };
    }
    
    if (size > config.metadata.maxImageSize) {
        return { valid: false, error: `Image is too large. Maximum size is ${config.metadata.maxImageSize / (1024 * 1024)}MB` };
    }
    
    if (!config.metadata.supportedFormats.includes(mimeType)) {
        return { valid: false, error: `Unsupported image format. Supported formats: ${config.metadata.supportedFormats.join(', ')}` };
    }
    
    return { valid: true };
}

// Add mainnet health check
export async function checkMainnetHealth(): Promise<{
    isHealthy: boolean;
    warnings: string[];
}> {
    const result = {
        isHealthy: true,
        warnings: [] as string[]
    };

    if (config.network !== 'mainnet-beta') {
        return result;
    }

    try {
        const connection = await getConnection();

        // Check slot progression
        const slot = await connection.getSlot();
        const oldSlot = slot - 10;
        const slotProgression = await connection.getBlockHeight();
        if (slotProgression < oldSlot + 5) {
            result.warnings.push('Network may be experiencing delays');
            result.isHealthy = false;
        }

        // Check recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        if (!blockhash) {
            result.warnings.push('Unable to get recent blockhash');
            result.isHealthy = false;
        }

        return result;
    } catch (error: unknown) {
        if (error instanceof Error) {
            result.warnings.push(`Health check failed: ${error.message}`);
        } else {
            result.warnings.push('Health check failed with unknown error');
        }
        result.isHealthy = false;
        return result;
    }
}

// Add mainnet transaction options
export function getTransactionOptions(isMainnet: boolean = config.network === 'mainnet-beta') {
    const commitment = isMainnet ? 'finalized' as 'processed' | 'confirmed' | 'finalized' : 'confirmed' as 'processed' | 'confirmed' | 'finalized';
    return {
        commitment,
        preflightCommitment: commitment,
        maxRetries: isMainnet ? config.mainnet.maxRetries : 1,
        skipPreflight: false,
        encoding: 'base64' as const
    };
}

// Add mainnet fee calculator
export async function calculateMainnetFees(
    connection: Connection,
    numSignatures: number = 1,
    numInstructions: number = 1
): Promise<number> {
    try {
        const recentBlockhash = await connection.getRecentBlockhash();
        const baseFee = recentBlockhash.feeCalculator.lamportsPerSignature;
        
        // Calculate total fee
        const priorityFee = config.network === 'mainnet-beta' ? 
            (process.env.MAINNET_PRIORITY_FEE ? parseInt(process.env.MAINNET_PRIORITY_FEE) : 5000) : 0;
            
        const totalFee = (
            (baseFee * numSignatures) + 
            (baseFee * numInstructions * 0.5) + 
            priorityFee
        );

        return totalFee / 1e9; // Convert to SOL
    } catch (error: unknown) {
        console.error('Error calculating fees:', error instanceof Error ? error.message : 'Unknown error');
        // Return conservative estimate
        return config.network === 'mainnet-beta' ? 0.01 : 0.001;
    }
}

// Add RPC fallback support
export const BACKUP_RPC_URLS = process.env.BACKUP_RPC_URLS?.split(',') || [];

export async function getConnectionWithFallback(): Promise<Connection> {
    const endpoints = [config.rpcUrl, ...BACKUP_RPC_URLS].filter((endpoint): endpoint is string => !!endpoint);
    
    for (const endpoint of endpoints) {
        try {
            const connection = new Connection(endpoint, {
                commitment: config.network === 'mainnet-beta' ? 'finalized' : 'confirmed',
                confirmTransactionInitialTimeout: 60000
            });
            
            // Test connection
            await connection.getLatestBlockhash();
            return connection;
        } catch (error) {
            console.warn(`RPC endpoint ${endpoint} failed, trying next...`);
        }
    }
    
    // If all endpoints fail, use default cluster URL
    return new Connection(clusterApiUrl(config.network));
}
