# Solana Token Management CLI

A command-line interface (CLI) tool for managing Solana SPL tokens. This tool provides comprehensive functionality for creating, managing, and interacting with tokens on the Solana blockchain.

## Features

- Token Creation and Management
  - Create new SPL tokens with customizable parameters
  - Mint additional tokens
  - Disable minting capability
  - Update mint and freeze authorities

- Token Operations
  - Transfer tokens between accounts
  - Burn tokens
  - Check token balances
  - Get token account information

- Account Management
  - Freeze token accounts
  - Thaw frozen accounts
  - Batch operations for freezing/thawing multiple accounts

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Solana CLI tools
- A Solana wallet (can be created using Solana CLI or Phantom)

## Installation

1. Clone the repository:
```bash
git clone [your-repo-url]
cd token-management-cli
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```
SOLANA_RPC_URL=https://api.devnet.solana.com
MAX_TRANSACTION_RETRIES=3
```

## Configuration

1. Place your wallet keypair in `wallet.json`
2. Update `wallet-config.json` with your preferred settings

## Usage

### Token Creation
```bash
npm run cli -- create-token --name "My Token" --symbol "MTK" --decimals 9 --supply 1000000
```

### Token Transfer
```bash
npm run cli -- transfer --mint [MINT_ADDRESS] --recipient [RECIPIENT_ADDRESS] --amount 100
```

### Token Burning
```bash
npm run cli -- burn --mint [MINT_ADDRESS] --amount 100
```

### Account Management
```bash
# Freeze an account
npm run cli -- freeze --mint [MINT_ADDRESS] --account [ACCOUNT_ADDRESS]

# Thaw an account
npm run cli -- thaw --mint [MINT_ADDRESS] --account [ACCOUNT_ADDRESS]

# Batch freeze accounts
npm run cli -- batch-freeze --mint [MINT_ADDRESS] --accounts [ACCOUNT1,ACCOUNT2,...]
```

### Authority Management
```bash
# Update mint authority
npm run cli -- update-mint-authority --mint [MINT_ADDRESS] --new-authority [NEW_AUTHORITY_ADDRESS]

# Disable minting
npm run cli -- disable-minting --mint [MINT_ADDRESS]

# Update freeze authority
npm run cli -- update-freeze-authority --mint [MINT_ADDRESS] --new-authority [NEW_AUTHORITY_ADDRESS]
```

## Error Handling

The CLI includes robust error handling with:
- Transaction retry mechanisms
- Detailed error messages
- Batch operation result reporting

## Development

### Project Structure
```
cli/
├── src/
│   ├── instructions.ts    # Token instruction implementations
│   ├── index.ts          # CLI entry point
│   └── ...
├── tokens/               # Token metadata storage
├── wallet.json          # Wallet keypair
└── wallet-config.json   # Wallet configuration
```

### Building
```bash
npm run build
```

### Running Tests
```bash
npm test
```

## Security Considerations

- Keep your wallet keypair secure and never commit it to version control
- Use environment variables for sensitive configuration
- Be cautious when granting or updating authority permissions
- Always verify transaction details before signing

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

[Your License]

## Support

For support, please [create an issue](your-repo-issues-url) or contact [your-contact-info].
