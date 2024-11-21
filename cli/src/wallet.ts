const { Keypair, Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const bs58 = require('bs58');
const { config, getCurrentFees } = require('./config');

// Type imports only for type annotations
import type { Connection as SolanaConnection } from '@solana/web3.js';

export interface WalletConfig {
    path: string;
    network: string;
    publicKey: string;
    lastUsed: string;
}

class WalletError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'WalletError';
    }
}

export class WalletManager {
    private static configPath = 'wallet-config.json';

    /**
     * Load a wallet from a keypair file
     */
    static async loadWallet(keypairPath?: string): Promise<typeof Keypair | null> {
        const path = keypairPath || config.walletPath;
        try {
            // Check if file exists
            if (!fs.existsSync(path)) {
                return null;
            }

            const keypairString = fs.readFileSync(path, { encoding: 'utf-8' });
            let wallet: typeof Keypair;
            
            try {
                // Try JSON array format first
                const keypairData = JSON.parse(keypairString);
                if (Array.isArray(keypairData)) {
                    wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
                } else {
                    throw new WalletError('Invalid wallet format: expected JSON array');
                }
            } catch (jsonError) {
                try {
                    // Try base58 format
                    const decoded = bs58.decode(keypairString.trim());
                    wallet = Keypair.fromSecretKey(decoded);
                } catch (base58Error) {
                    throw new WalletError(
                        'Failed to parse wallet key. Supported formats:\n' +
                        '1. JSON array of numbers (CLI wallet)\n' +
                        '2. Base58 string (Phantom export)',
                        { jsonError, base58Error }
                    );
                }
            }

            // Update wallet config
            this.saveWalletConfig({
                path,
                network: config.network,
                publicKey: wallet.publicKey.toString(),
                lastUsed: new Date().toISOString()
            });

            return wallet;
        } catch (error) {
            if (error instanceof WalletError) {
                throw error;
            }
            throw new WalletError(
                `Failed to load wallet key from ${path}`,
                error instanceof Error ? error : String(error)
            );
        }
    }

    /**
     * Create a new wallet
     */
    static async createWallet(path: string): Promise<{
        wallet: typeof Keypair;
        mnemonic: string[];
    }> {
        try {
            const wallet = Keypair.generate();
            
            // Save wallet
            fs.writeFileSync(path, JSON.stringify(Array.from(wallet.secretKey)));
            
            // Save wallet config
            this.saveWalletConfig({
                path,
                network: config.network,
                publicKey: wallet.publicKey.toString(),
                lastUsed: new Date().toISOString()
            });

            // Generate mnemonic (this is just for display, not used for wallet generation)
            const mnemonic = Array.from({ length: 12 }, () => 
                Math.random().toString(36).substring(2, 15)
            );

            return { wallet, mnemonic };
        } catch (error) {
            throw new WalletError(
                `Failed to create wallet: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }

    /**
     * Save wallet configuration
     */
    static saveWalletConfig(config: WalletConfig): void {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            throw new WalletError(
                `Failed to save wallet configuration: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }

    /**
     * Load wallet configuration
     */
    static loadWalletConfig(): WalletConfig | null {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(data);
            }
            return null;
        } catch (error) {
            throw new WalletError(
                `Failed to load wallet configuration: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }

    /**
     * Verify wallet balance and estimate required fees
     */
    static async verifyWalletBalance(
        wallet: typeof Keypair,
        connection: SolanaConnection,
        operation: 'create' | 'update' = 'create'
    ): Promise<{
        balance: number;
        sufficient: boolean;
        requiredBalance: number;
        fees: {
            estimated: number;
            total: number;
        };
    }> {
        try {
            const balance = await connection.getBalance(wallet.publicKey);
            const fees = await getCurrentFees();
            
            // Calculate required balance based on operation
            const estimatedFees = operation === 'create' 
                ? fees.createToken
                : fees.updateMetadata;
            
            const totalRequired = estimatedFees + fees.transaction;

            return {
                balance: balance / 1e9,
                sufficient: balance >= totalRequired * 1e9,
                requiredBalance: totalRequired,
                fees: {
                    estimated: estimatedFees,
                    total: totalRequired
                }
            };
        } catch (error) {
            throw new WalletError(
                `Failed to verify wallet balance: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }

    /**
     * Request SOL airdrop (devnet only)
     */
    static async requestAirdrop(
        wallet: typeof Keypair,
        connection: SolanaConnection,
        amount: number = 1
    ): Promise<{ signature: string; newBalance: number }> {
        if (config.network !== 'devnet') {
            throw new WalletError('Airdrop is only available on devnet');
        }

        try {
            const signature = await connection.requestAirdrop(
                wallet.publicKey,
                amount * 1e9
            );
            
            await connection.confirmTransaction(signature);
            const newBalance = await connection.getBalance(wallet.publicKey);
            
            return {
                signature,
                newBalance: newBalance / 1e9
            };
        } catch (error) {
            throw new WalletError(
                `Airdrop failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }
}
