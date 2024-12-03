# Solana Token Management CLI

A command-line interface (CLI) tool for creating and managing SPL tokens on the Solana blockchain. This tool supports both Devnet and Mainnet operations with a user-friendly interface.

## Features

- 🪙 Create SPL tokens with custom supply and decimals
- 📝 Manage token metadata (create/update)
- 💸 Transfer tokens between wallets
- 🔥 Burn tokens
- 💰 Check token balances
- 🌐 Support for both Devnet and Mainnet
- 💧 Request SOL airdrop (Devnet only)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Solana CLI tools
- A Solana wallet keypair file

## Installation

1. Clone this repository:
```bash
git clone https://github.com/husky-696/Solana-Token-Management-CLI.git
cd Solana-Token-Management-CLI
```

2. Install dependencies:
```bash
npm install
```

3. Configure your wallet:
- Place your wallet keypair JSON file in the `cli` directory
- Update `wallet-config.json` with your wallet file path

## Configuration

The app uses two main configuration files:

1. `wallet-config.json`:
```json
{
    "walletPath": "path/to/your/wallet.json"
}
```

2. Environment variables (optional):
- `SOLANA_NETWORK`: 'devnet' or 'mainnet-beta' (default: 'devnet')
- `SOLANA_RPC_URL`: Custom RPC endpoint (optional)

## Usage

1. Start the application:
```bash
npm start
```

2. Available options in the menu:
- Create New Token
- Transfer Tokens
- Burn Tokens
- Check Token Balance
- Create Token Metadata
- Update Token Metadata
- Request Devnet Airdrop (only on devnet)
- Help
- Exit

### Creating a Token

1. Select "Create New Token" from the menu
2. Enter token details:
   - Name
   - Symbol
   - Initial supply
   - Decimals (default: 9)

### Managing Token Metadata

Token metadata is stored in the `tokens` directory as JSON files:
```json
{
    "name": "Token Name",
    "symbol": "TKN",
    "mint": "token_mint_address",
    "decimals": 9,
    "initialSupply": 1000000,
    "network": "devnet",
    "createdAt": "timestamp"
}
```

## Network Support

- **Devnet**: Use for testing with free airdropped SOL
- **Mainnet**: Use for production tokens (requires real SOL)

To switch networks, update the `SOLANA_NETWORK` environment variable.

## Troubleshooting

1. **Insufficient SOL Balance**
   - On devnet: Use the "Request Devnet Airdrop" option
   - On mainnet: Transfer real SOL to your wallet

2. **Transaction Errors**
   - Verify your wallet has sufficient SOL for transaction fees
   - Check network status and connection
   - Ensure correct wallet permissions

## Security Notes

- Keep your wallet keypair file secure and never share it
- Double-check all transaction details before confirming
- Back up token mint addresses and metadata

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please open an issue on GitHub.