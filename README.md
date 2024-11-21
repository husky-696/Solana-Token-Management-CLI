# Solana Token Manager CLI

A command-line interface (CLI) tool for creating and managing SPL tokens on Solana.

## Features

- Create new SPL tokens with custom metadata
- Transfer tokens between accounts
- Burn tokens
- Check token balances
- Works with both Devnet (testing) and Mainnet
- Simple command-line interface

## Prerequisites

1. Install Node.js (version 16 or higher)
2. A Solana wallet keypair file
3. Some SOL for transactions

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/token-managment.git
cd token-managment
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Global Options
- `-n, --network <string>`: Solana network (devnet/mainnet-beta) (default: "devnet")
- `-u, --rpc-url <string>`: Custom RPC URL

### Creating a Token
```bash
solana-token-cli create-token -w ./wallet.json -n "My Token" -s MT -a 1000000
```
Options:
- `-w, --wallet <path>`: Path to wallet keypair file
- `-n, --name <string>`: Token name
- `-s, --symbol <string>`: Token symbol
- `-a, --amount <number>`: Initial token supply
- `-d, --decimals <number>`: Token decimals (default: 9)

### Transferring Tokens
```bash
solana-token-cli transfer -w ./wallet.json -m <MINT_ADDRESS> -r <RECIPIENT_ADDRESS> -a 100
```
Options:
- `-w, --wallet <path>`: Path to wallet keypair file
- `-m, --mint <string>`: Token mint address
- `-r, --recipient <string>`: Recipient wallet address
- `-a, --amount <number>`: Amount to transfer

### Checking Token Balance
```bash
solana-token-cli balance -w ./wallet.json -m <MINT_ADDRESS>
```
Options:
- `-w, --wallet <path>`: Path to wallet keypair file
- `-m, --mint <string>`: Token mint address

### Burning Tokens
```bash
solana-token-cli burn -w ./wallet.json -m <MINT_ADDRESS> -a 100
```
Options:
- `-w, --wallet <path>`: Path to wallet keypair file
- `-m, --mint <string>`: Token mint address
- `-a, --amount <number>`: Amount to burn

## Testing on Devnet

For testing, use Devnet first:

1. Get free SOL for testing:
```bash
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

2. Create a test token:
```bash
solana-token-cli create-token -w ./wallet.json -n "Test Token" -s TEST -a 1000000
```

## Going to Mainnet

When you're ready to create real tokens:

1. Use the `--network` option:
```bash
solana-token-cli create-token --network mainnet-beta -w ./wallet.json -n "My Token" -s MT -a 1000000
```

2. Ensure you have enough SOL in your wallet for the transaction fees.

## Fees (Approximate)

Devnet:
- Free (use airdrop for testing)

Mainnet:
- Token Creation: ~0.05-0.1 SOL
- Token Transfer: ~0.000005 SOL
- Token Burn: ~0.000005 SOL