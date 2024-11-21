import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    transfer,
    burn,
    getAccount,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getMint,
} from '@solana/spl-token';

export class TokenInstructions {
    private connection: Connection;
    private payer: Keypair;

    constructor(connection: Connection, payer: Keypair) {
        this.connection = connection;
        this.payer = payer;
    }

    async createToken(
        name: string,
        symbol: string,
        decimals: number,
        initialSupply: number
    ): Promise<string> {
        try {
            // Check wallet balance first
            const balance = await this.connection.getBalance(this.payer.publicKey);
            console.log(`Current wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
            
            if (balance < LAMPORTS_PER_SOL * 0.1) { // Minimum 0.1 SOL recommended
                throw new Error(`Insufficient SOL balance. You have ${balance / LAMPORTS_PER_SOL} SOL, but at least 0.1 SOL is recommended.`);
            }

            // Create mint account
            const mint = await createMint(
                this.connection,
                this.payer,
                this.payer.publicKey,
                this.payer.publicKey,
                decimals
            );

            // Get the token account of the fromWallet address, and if it does not exist, create it
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            // Mint tokens
            if (initialSupply > 0) {
                await mintTo(
                    this.connection,
                    this.payer,
                    mint,
                    tokenAccount.address,
                    this.payer,
                    initialSupply * Math.pow(10, decimals)
                );
            }

            return mint.toBase58();
        } catch (error) {
            console.error('Detailed error:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to create token: ${error.message}`);
            }
            throw new Error('Failed to create token: Unknown error');
        }
    }

    async getTokenBalance(mint: PublicKey): Promise<number> {
        try {
            // Get the associated token account
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            // Get the account info
            const accountInfo = await getAccount(this.connection, tokenAccount.address);
            
            // Get mint info for decimals
            const mintInfo = await getMint(this.connection, mint);
            
            // Calculate actual balance considering decimals
            return Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to get token balance: ${error.message}`);
            } else {
                throw new Error('Failed to get token balance: Unknown error');
            }
        }
    }

    async transferTokens(
        mint: PublicKey,
        recipient: PublicKey,
        amount: number
    ): Promise<string> {
        try {
            const sourceAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            const destinationAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                recipient
            );

            const signature = await transfer(
                this.connection,
                this.payer,
                sourceAccount.address,
                destinationAccount.address,
                this.payer,
                amount
            );

            return signature;
        } catch (error: any) {
            throw new Error(`Failed to transfer tokens: ${error.message || 'Unknown error'}`);
        }
    }

    async burnTokens(
        mint: PublicKey,
        amount: number
    ): Promise<string> {
        try {
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            const signature = await burn(
                this.connection,
                this.payer,
                tokenAccount.address,
                mint,
                this.payer,
                amount
            );

            return signature;
        } catch (error: any) {
            throw new Error(`Failed to burn tokens: ${error.message || 'Unknown error'}`);
        }
    }
}