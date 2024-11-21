import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export interface TokenInfo {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: number;
}

export class MainnetValidator {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async validateWallet(publicKey: PublicKey): Promise<ValidationResult> {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            // Check if account exists
            const account = await this.connection.getAccountInfo(publicKey);
            if (!account) {
                result.errors.push('Wallet account does not exist on mainnet');
                result.isValid = false;
                return result;
            }

            // Check balance
            const balance = await this.connection.getBalance(publicKey);
            const solBalance = balance / 1e9;

            if (solBalance < 0.1) {
                result.warnings.push('Low SOL balance. Consider adding more SOL for transaction fees');
            }

            // Check recent activity
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 10 });
            if (signatures.length === 0) {
                result.warnings.push('No recent transaction history found');
            }

        } catch (error: any) {
            result.errors.push(`Failed to validate wallet: ${error.message || 'Unknown error'}`);
            result.isValid = false;
        }

        return result;
    }

    async validateToken(mint: PublicKey): Promise<ValidationResult> {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            // Check if token exists
            const mintInfo = await getMint(this.connection, mint);
            if (!mintInfo) {
                result.errors.push('Token mint does not exist on mainnet');
                result.isValid = false;
                return result;
            }

            // Check supply
            const supply = Number(mintInfo.supply);
            if (supply === 0) {
                result.warnings.push('Token has zero supply');
            }

            // Check decimals
            if (mintInfo.decimals > 9) {
                result.warnings.push('Unusual number of decimals (>9)');
            }

        } catch (error: any) {
            result.errors.push(`Failed to validate token: ${error.message || 'Unknown error'}`);
            result.isValid = false;
        }

        return result;
    }

    async validateNetwork(): Promise<ValidationResult> {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        try {
            // Check if we can connect to the network
            const version = await this.connection.getVersion();
            if (!version) {
                result.errors.push('Unable to connect to Solana mainnet');
                result.isValid = false;
                return result;
            }

            // Check if the network is responding
            const blockHeight = await this.connection.getBlockHeight();
            if (!blockHeight) {
                result.warnings.push('Network may be experiencing issues');
            }

            // Check recent block production
            const slot = await this.connection.getSlot();
            const recentPerformanceSamples = await this.connection.getRecentPerformanceSamples(10);
            
            if (recentPerformanceSamples.length === 0) {
                result.warnings.push('Unable to fetch recent performance metrics');
            } else {
                const averageBlockTime = recentPerformanceSamples.reduce((acc, sample) => 
                    acc + sample.samplePeriodSecs / sample.numSlots, 0) / recentPerformanceSamples.length;
                
                if (averageBlockTime > 0.8) { // Solana targets 0.4s block times
                    result.warnings.push('Network may be experiencing slower block times than usual');
                }
            }

        } catch (error: any) {
            result.errors.push(`Failed to validate network: ${error.message || 'Unknown error'}`);
            result.isValid = false;
        }

        return result;
    }
}
