import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    getMint,
    createMint,
    mintTo,
    transfer,
    burn,
    setAuthority,
    Account,
    Mint,
    AuthorityType,
    createFreezeAccountInstruction,
    createThawAccountInstruction,
} from '@solana/spl-token';

export interface BatchOperationResult {
    successes: string[];
    failures: { account: string; error: string; }[];
}

export class TokenInstructions {
    transferTokens(arg0: PublicKey, arg1: PublicKey, arg2: number) {
        throw new Error('Method not implemented.');
    }
    burnTokens(arg0: PublicKey, arg1: number) {
        throw new Error('Method not implemented.');
    }
    static disableMinting(mintPubkey: PublicKey, wallet: Keypair): Promise<string> {
        throw new Error('Method not implemented.');
    }
    static updateMintAuthority(mintPubkey: PublicKey, wallet: Keypair, newAuthority: PublicKey | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    static updateFreezeAuthority(mintPubkey: PublicKey, wallet: Keypair, newAuthority: PublicKey | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    static isAccountFrozen(accountPubkey: PublicKey): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    static freezeAccount(mintPubkey: PublicKey, accountPubkey: PublicKey, wallet: Keypair): Promise<string> {
        throw new Error('Method not implemented.');
    }
    static thawAccount(mintPubkey: PublicKey, accountPubkey: PublicKey, wallet: Keypair): Promise<string> {
        throw new Error('Method not implemented.');
    }
    static async batchFreezeAccounts(mintPubkey: PublicKey, accountPubkeys: PublicKey[], wallet: Keypair): Promise<BatchOperationResult> {
        const results: BatchOperationResult = {
            successes: [],
            failures: []
        };

        for (const accountPubkey of accountPubkeys) {
            try {
                const transaction = new Transaction().add(
                    createFreezeAccountInstruction(
                        accountPubkey,
                        mintPubkey,
                        wallet.publicKey,
                        [],
                        TOKEN_PROGRAM_ID
                    )
                );

                const signature = await sendAndConfirmTransaction(
                    new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'),
                    transaction,
                    [wallet]
                );

                results.successes.push(accountPubkey.toBase58());
            } catch (error) {
                results.failures.push({
                    account: accountPubkey.toBase58(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    static async batchThawAccounts(mintPubkey: PublicKey, accountPubkeys: PublicKey[], wallet: Keypair): Promise<BatchOperationResult> {
        const results: BatchOperationResult = {
            successes: [],
            failures: []
        };

        for (const accountPubkey of accountPubkeys) {
            try {
                const transaction = new Transaction().add(
                    createThawAccountInstruction(
                        accountPubkey,
                        mintPubkey,
                        wallet.publicKey,
                        [],
                        TOKEN_PROGRAM_ID
                    )
                );

                const signature = await sendAndConfirmTransaction(
                    new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'),
                    transaction,
                    [wallet]
                );

                results.successes.push(accountPubkey.toBase58());
            } catch (error) {
                results.failures.push({
                    account: accountPubkey.toBase58(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }
    private connection: Connection;
    private payer: Keypair;

    constructor(connection: Connection, payer: Keypair) {
        this.connection = connection;
        this.payer = payer;
    }

    private async sendTransactionWithRetry(
        transaction: Transaction,
        signers: Keypair[],
        maxRetries = 3
    ): Promise<string> {
        let lastError: Error | unknown;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Get a fresh blockhash for each attempt
                const { blockhash, lastValidBlockHeight } = 
                    await this.connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.lastValidBlockHeight = lastValidBlockHeight;
                
                // Clear all signatures for retry
                transaction.signatures = [];
                
                // Sign transaction
                signers.forEach(signer => {
                    transaction.sign(signer);
                });
                
                // Send transaction
                const signature = await sendAndConfirmTransaction(
                    this.connection,
                    transaction,
                    signers,
                    {
                        commitment: 'confirmed',
                        maxRetries: 5,
                    }
                );
                
                return signature;
            } catch (error) {
                console.log(`Attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
                lastError = error;
                
                // Wait before retry (exponential backoff)
                if (attempt < maxRetries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    async createToken(
        name: string,
        symbol: string,
        decimals: number,
        amount: number,
        mintAuthority?: PublicKey,
        freezeAuthority?: PublicKey
    ): Promise<string> {
        try {
            // Create mint account
            const mint = await createMint(
                this.connection,
                this.payer,
                mintAuthority || this.payer.publicKey,
                freezeAuthority || null,
                decimals
            );

            // Get the token account of the wallet address, and if it does not exist, create it
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            // Mint tokens to the token account
            if (amount > 0) {
                await mintTo(
                    this.connection,
                    this.payer,
                    mint,
                    tokenAccount.address,
                    mintAuthority || this.payer,
                    amount * Math.pow(10, decimals)
                );
            }

            return mint.toBase58();
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to create token');
        }
    }

    async transfer(
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

            const mintInfo = await getMint(this.connection, mint);
            const rawAmount = amount * Math.pow(10, mintInfo.decimals);

            const signature = await transfer(
                this.connection,
                this.payer,
                sourceAccount.address,
                destinationAccount.address,
                this.payer,
                rawAmount
            );

            return signature;
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to transfer tokens');
        }
    }

    async burn(
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

            const mintInfo = await getMint(this.connection, mint);
            const rawAmount = amount * Math.pow(10, mintInfo.decimals);

            const signature = await burn(
                this.connection,
                this.payer,
                tokenAccount.address,
                mint,
                this.payer,
                rawAmount
            );

            return signature;
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to burn tokens');
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

    async isAccountFrozen(account: PublicKey): Promise<boolean> {
        try {
            const accountInfo = await getAccount(this.connection, account);
            return accountInfo.isFrozen;
        } catch (error) {
            throw new Error(`Failed to check account freeze status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async verifyAuthority(
        mint: PublicKey,
        authority: Keypair,
        authorityType: 'mint' | 'freeze'
    ): Promise<boolean> {
        try {
            const mintInfo = await getMint(this.connection, mint);
            if (authorityType === 'mint') {
                return mintInfo.mintAuthority?.equals(authority.publicKey) || false;
            } else {
                return mintInfo.freezeAuthority?.equals(authority.publicKey) || false;
            }
        } catch (error) {
            throw new Error(`Failed to verify ${authorityType} authority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async freezeAccount(
        mint: PublicKey,
        accountPubkey: PublicKey,
        freezeAuthority: Keypair
    ): Promise<string> {
        try {
            const freezeInstruction = createFreezeAccountInstruction(
                accountPubkey,
                mint,
                freezeAuthority.publicKey,
                [],
                TOKEN_PROGRAM_ID
            );

            const transaction = new Transaction().add(freezeInstruction);
            return await this.sendTransactionWithRetry(transaction, [this.payer, freezeAuthority]);
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to freeze account');
        }
    }

    async thawAccount(
        mint: PublicKey,
        accountPubkey: PublicKey,
        freezeAuthority: Keypair
    ): Promise<string> {
        try {
            const thawInstruction = createThawAccountInstruction(
                accountPubkey,
                mint,
                freezeAuthority.publicKey,
                [],
                TOKEN_PROGRAM_ID
            );

            const transaction = new Transaction().add(thawInstruction);
            return await this.sendTransactionWithRetry(transaction, [this.payer, freezeAuthority]);
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to thaw account');
        }
    }

    async batchFreezeAccounts(
        mint: PublicKey,
        accountPubkeys: PublicKey[],
        freezeAuthority: Keypair
    ): Promise<BatchOperationResult> {
        const results: BatchOperationResult = {
            successes: [],
            failures: []
        };

        for (const account of accountPubkeys) {
            try {
                const isFrozen = await this.isAccountFrozen(account);
                if (isFrozen) {
                    results.failures.push({
                        account: account.toBase58(),
                        error: 'Account is already frozen'
                    });
                    continue;
                }

                const freezeInstruction = createFreezeAccountInstruction(
                    account,
                    mint,
                    freezeAuthority.publicKey,
                    [],
                    TOKEN_PROGRAM_ID
                );

                const transaction = new Transaction().add(freezeInstruction);
                await this.sendTransactionWithRetry(transaction, [this.payer, freezeAuthority]);
                results.successes.push(account.toBase58());
            } catch (error) {
                results.failures.push({
                    account: account.toBase58(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    async batchThawAccounts(
        mint: PublicKey,
        accountPubkeys: PublicKey[],
        freezeAuthority: Keypair
    ): Promise<BatchOperationResult> {
        const results: BatchOperationResult = {
            successes: [],
            failures: []
        };

        for (const account of accountPubkeys) {
            try {
                const isFrozen = await this.isAccountFrozen(account);
                if (!isFrozen) {
                    results.failures.push({
                        account: account.toBase58(),
                        error: 'Account is not frozen'
                    });
                    continue;
                }

                const thawInstruction = createThawAccountInstruction(
                    account,
                    mint,
                    freezeAuthority.publicKey,
                    [],
                    TOKEN_PROGRAM_ID
                );

                const transaction = new Transaction().add(thawInstruction);
                await this.sendTransactionWithRetry(transaction, [this.payer, freezeAuthority]);
                results.successes.push(account.toBase58());
            } catch (error) {
                results.failures.push({
                    account: account.toBase58(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return results;
    }

    async mintMoreTokens(
        mint: PublicKey,
        amount: number,
        mintAuthority: Keypair
    ): Promise<string> {
        try {
            // Get mint info to check decimals
            const mintInfo = await getMint(this.connection, mint);
            
            // Verify mint authority
            if (!mintInfo.mintAuthority?.equals(mintAuthority.publicKey)) {
                throw new Error('Provided keypair is not the mint authority');
            }

            // Get or create associated token account
            const tokenAccount = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.payer,
                mint,
                this.payer.publicKey
            );

            // Convert amount to raw amount using decimals
            const rawAmount = amount * Math.pow(10, mintInfo.decimals);

            // Mint tokens
            const signature = await mintTo(
                this.connection,
                this.payer,
                mint,
                tokenAccount.address,
                mintAuthority,
                rawAmount
            );

            return signature;
        } catch (error) {
            throw new Error(`Failed to mint tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async disableMinting(
        mint: PublicKey,
        mintAuthority: Keypair
    ): Promise<string> {
        try {
            // Get mint info to verify authority
            const mintInfo = await getMint(this.connection, mint);
            
            // Verify mint authority
            if (!mintInfo.mintAuthority?.equals(mintAuthority.publicKey)) {
                throw new Error('Provided keypair is not the mint authority');
            }

            // Disable minting by setting mint authority to null
            const signature = await setAuthority(
                this.connection,
                this.payer,
                mint,
                mintAuthority,
                AuthorityType.MintTokens,
                null
            );

            return signature;
        } catch (error) {
            throw new Error(`Failed to disable minting: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async updateMintAuthority(
        mint: PublicKey,
        currentAuthority: Keypair,
        newAuthority: PublicKey | undefined
    ): Promise<string> {
        try {
            if (!await this.verifyAuthority(mint, currentAuthority, 'mint')) {
                throw new Error('Invalid mint authority');
            }

            const signature = await setAuthority(
                this.connection,
                this.payer,
                mint,
                currentAuthority,
                AuthorityType.MintTokens,
                newAuthority || null
            );

            return signature;
        } catch (error) {
            throw new Error(`Failed to update mint authority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async updateFreezeAuthority(
        mint: PublicKey,
        currentAuthority: Keypair,
        newAuthority: PublicKey | undefined
    ): Promise<string> {
        try {
            if (!await this.verifyAuthority(mint, currentAuthority, 'freeze')) {
                throw new Error('Invalid freeze authority');
            }

            const signature = await setAuthority(
                this.connection,
                this.payer,
                mint,
                currentAuthority,
                AuthorityType.FreezeAccount,
                newAuthority || null
            );

            return signature;
        } catch (error) {
            throw new Error(`Failed to update freeze authority: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

async function executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = Number(process.env.MAX_TRANSACTION_RETRIES) || 3
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            console.warn(`Attempt ${i + 1} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    
    throw lastError || new Error('Operation failed after retries');
}