import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import {
    createCreateMetadataAccountV3Instruction,
    createUpdateMetadataAccountV2Instruction,
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    DataV2,
    Creator
} from '@metaplex-foundation/mpl-token-metadata';

export interface TokenMetadata {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints?: number;
    creators?: Creator[];
}

export class MetadataManager {
    private static readonly SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
    private static readonly MIN_IMAGE_SIZE = 1024; // 1KB
    private static readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

    /**
     * Validates an image file for token metadata
     */
    static validateImage(imagePath: string): { valid: boolean; error?: string } {
        try {
            if (!fs.existsSync(imagePath)) {
                return { valid: false, error: 'Image file does not exist' };
            }

            const stats = fs.statSync(imagePath);
            if (stats.size < this.MIN_IMAGE_SIZE) {
                return { valid: false, error: 'Image file is too small (min 1KB)' };
            }
            if (stats.size > this.MAX_IMAGE_SIZE) {
                return { valid: false, error: 'Image file is too large (max 5MB)' };
            }

            // Add more image validation if needed
            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Image validation failed: ${(error as any).message}` };
        }
    }

    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async getTokenMetadata(mint: PublicKey): Promise<TokenMetadata | null> {
        try {
            const metadataAccount = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('metadata'),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mint.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            )[0];

            const metadataAccountInfo = await this.connection.getAccountInfo(metadataAccount);
            if (!metadataAccountInfo) {
                return null;
            }

            // Import the deserializer from metaplex
            const { Metadata } = await import('@metaplex-foundation/mpl-token-metadata');
            const metadata = Metadata.deserialize(metadataAccountInfo.data)[0];
            
            // Convert COption<Creator[]> to Creator[] | undefined
            const creators = metadata.data.creators === null ? undefined : metadata.data.creators;
            
            return {
                name: metadata.data.name.replace(/\0/g, ''),
                symbol: metadata.data.symbol.replace(/\0/g, ''),
                uri: metadata.data.uri.replace(/\0/g, ''),
                sellerFeeBasisPoints: metadata.data.sellerFeeBasisPoints,
                creators
            };
        } catch (error) {
            console.error('Error fetching metadata:', error);
            return null;
        }
    }

    private async prepareMetadataTransaction(
        mint: PublicKey,
        metadata: TokenMetadata,
        payer: Keypair,
        isUpdate: boolean
    ): Promise<Transaction> {
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        );

        const data: DataV2 = {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || 0,
            creators: metadata.creators || null,
            collection: null,
            uses: null
        };

        const instruction = isUpdate
            ? createUpdateMetadataAccountV2Instruction(
                {
                    metadata: metadataAddress,
                    updateAuthority: payer.publicKey,
                },
                {
                    updateMetadataAccountArgsV2: {
                        data,
                        updateAuthority: payer.publicKey,
                        primarySaleHappened: true,
                        isMutable: true
                    }
                }
            )
            : createCreateMetadataAccountV3Instruction(
                {
                    metadata: metadataAddress,
                    mint,
                    mintAuthority: payer.publicKey,
                    payer: payer.publicKey,
                    updateAuthority: payer.publicKey,
                },
                {
                    createMetadataAccountArgsV3: {
                        data,
                        isMutable: true,
                        collectionDetails: null
                    }
                }
            );

        return new Transaction().add(instruction);
    }

    async setMetadata(
        mint: PublicKey,
        metadata: TokenMetadata,
        payer: Keypair
    ): Promise<string> {
        try {
            const [metadataAddress] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('metadata'),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mint.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            // Check if metadata already exists
            const metadataAccountInfo = await this.connection.getAccountInfo(metadataAddress);
            const isUpdate = metadataAccountInfo !== null;

            const data: DataV2 = {
                name: metadata.name,
                symbol: metadata.symbol,
                uri: metadata.uri,
                sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || 0,
                creators: metadata.creators || null,
                collection: null,
                uses: null
            };

            const instruction = isUpdate
                ? createUpdateMetadataAccountV2Instruction(
                    {
                        metadata: metadataAddress,
                        updateAuthority: payer.publicKey,
                    },
                    {
                        updateMetadataAccountArgsV2: {
                            data,
                            updateAuthority: payer.publicKey,
                            primarySaleHappened: true,
                            isMutable: true
                        }
                    }
                )
                : createCreateMetadataAccountV3Instruction(
                    {
                        metadata: metadataAddress,
                        mint,
                        mintAuthority: payer.publicKey,
                        payer: payer.publicKey,
                        updateAuthority: payer.publicKey,
                    },
                    {
                        createMetadataAccountArgsV3: {
                            data,
                            isMutable: true,
                            collectionDetails: null
                        }
                    }
                );

            const transaction = new Transaction().add(instruction);
            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [payer],
                { commitment: 'confirmed' }
            );

            return signature;
        } catch (error: any) {
            throw new Error(`Failed to ${isUpdate ? 'update' : 'create'} metadata: ${(error as any).message}`);
        }
    }

    async createMetadata(
        mint: PublicKey,
        metadata: TokenMetadata,
        payer: Keypair
    ): Promise<string> {
        return this.setMetadata(mint, metadata, payer);
    }

    async updateMetadata(
        mint: PublicKey,
        metadata: TokenMetadata,
        payer: Keypair
    ): Promise<string> {
        return this.setMetadata(mint, metadata, payer);
    }
}
