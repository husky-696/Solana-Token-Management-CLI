import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
    createCreateMetadataAccountV3Instruction,
    createUpdateMetadataAccountV2Instruction,
} from '@metaplex-foundation/mpl-token-metadata';

export class TokenInstructions {
    static async createToken(
        payer: PublicKey,
        mintKeypair: PublicKey,
        name: string,
        symbol: string,
        decimals: number,
        totalSupply: number,
    ): Promise<TransactionInstruction[]> {
        const instructions: TransactionInstruction[] = [];
        
        // Create mint account
        instructions.push(
            SystemProgram.createAccount({
                fromPubkey: payer,
                newAccountPubkey: mintKeypair,
                space: 82,
                lamports: await TOKEN_PROGRAM_ID.getMinimumBalanceForRentExemption(82),
                programId: TOKEN_PROGRAM_ID,
            })
        );

        // Initialize mint
        instructions.push(
            createInitializeMintInstruction(
                mintKeypair,
                decimals,
                payer,
                payer,
            )
        );

        // Create metadata
        instructions.push(
            createCreateMetadataAccountV3Instruction({
                metadata: await getMetadataAddress(mintKeypair),
                mint: mintKeypair,
                mintAuthority: payer,
                payer,
                updateAuthority: payer,
                data: {
                    name,
                    symbol,
                    uri: '',
                    sellerFeeBasisPoints: 0,
                    creators: null,
                    collection: null,
                    uses: null,
                }
            })
        );

        return instructions;
    }

    static async updateMetadata(
        mint: PublicKey,
        authority: PublicKey,
        name?: string,
        symbol?: string,
        uri?: string,
    ): Promise<TransactionInstruction> {
        return createUpdateMetadataAccountV2Instruction({
            metadata: await getMetadataAddress(mint),
            updateAuthority: authority,
            data: {
                name,
                symbol,
                uri,
                sellerFeeBasisPoints: 0,
                creators: null,
                collection: null,
                uses: null,
            }
        });
    }
} 