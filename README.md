# @tetherto/wdk-wallet-evm-erc-7702-gasless

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage gasless EIP-7702 wallets for EVM-compatible blockchains. This package abstracts all EIP-7702 delegation and ERC-4337 UserOperation complexity behind a simple API — call `transfer()` and delegation, UserOp signing, and paymaster sponsorship all happen internally. Zero ETH required.

## About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## Features

- **EIP-7702 Delegation**: EOA becomes a smart account via delegation — no Safe contract, no address prediction
- **Gasless Transactions**: Full paymaster integration for sponsored or ERC-20 token gas payment
- **Provider-Agnostic**: Works with any ERC-4337 bundler/paymaster (Pimlico, Candide, etc.)
- **EVM Derivation Paths**: Support for BIP-44 standard derivation paths for Ethereum (m/44'/60')
- **Multi-Account Management**: Create and manage multiple wallets from a single seed phrase
- **ERC20 Support**: Query native token and ERC20 token balances, transfers, and approvals
- **Automatic Delegation Lifecycle**: Delegation is checked and signed automatically per operation

## Installation

```bash
npm install @tetherto/wdk-wallet-evm-erc-7702-gasless
```

## Quick Start

### Creating a Wallet (Sponsored Mode)

```javascript
import WalletManagerEvmErc7702Gasless from '@tetherto/wdk-wallet-evm-erc-7702-gasless'

const wallet = new WalletManagerEvmErc7702Gasless(seedPhrase, {
  provider: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  bundlerUrl: 'https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY',
  isSponsored: true,
  paymasterContext: { sponsorshipPolicyId: 'sp_my_policy' }
})

const account = await wallet.getAccount(0)
const address = await account.getAddress() // Returns the EOA address directly
```

### Creating a Wallet (Paymaster Token Mode)

```javascript
const wallet = new WalletManagerEvmErc7702Gasless(seedPhrase, {
  provider: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  bundlerUrl: 'https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY',
  paymasterToken: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }, // USDT
  paymasterContext: { ... },
  transferMaxFee: 100000000000000n
})
```

### Using a Different Bundler Provider

The module is provider-agnostic. Just point `bundlerUrl` to any ERC-4337 compatible endpoint:

```javascript
// Candide
const wallet = new WalletManagerEvmErc7702Gasless(seedPhrase, {
  provider: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  bundlerUrl: 'https://api.candide.dev/bundler/v3/11155111/YOUR_KEY',
  isSponsored: true,
  paymasterContext: { ... } // Candide-specific context
})
```

### Custom Delegation Target

```javascript
const wallet = new WalletManagerEvmErc7702Gasless(seedPhrase, {
  provider: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  bundlerUrl: 'https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY',
  isSponsored: true,
  delegationAddress: '0xCustomImplementation...', // custom smart account impl
  paymasterContext: { sponsorshipPolicyId: 'sp_my_policy' }
})
```

### Managing Multiple Accounts

```javascript
const account0 = await wallet.getAccount(0)
const account1 = await wallet.getAccount(1)

// Or by custom derivation path (full path: m/44'/60'/0'/0/5)
const customAccount = await wallet.getAccountByPath("0'/0/5")
```

### Checking Balances

```javascript
// Native token balance (in wei)
const balance = await account.getBalance()

// ERC20 token balance
const tokenBalance = await account.getTokenBalance('0xdAC17F958D2ee523a2206206994597C13D831ec7')

// Multiple token balances
const balances = await account.getTokenBalances([token1, token2])
```

### Token Transfers

```javascript
// Transfer ERC20 tokens — delegation + UserOp + paymaster handled internally
const result = await account.transfer({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  recipient: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n // 1 USDT (6 decimals)
})
console.log('UserOperation hash:', result.hash)
console.log('Fee:', result.fee)

// Quote transfer fee before sending
const quote = await account.quoteTransfer({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  recipient: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n
})
console.log('Estimated fee:', quote.fee)
```

### Sending Transactions

```javascript
// Send a raw transaction via UserOperation
const result = await account.sendTransaction({
  to: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  value: 0n,
  data: '0x...'
})

// Batch transactions
const batchResult = await account.sendTransaction([
  { to: '0x...', value: 0n, data: '0x...' },
  { to: '0x...', value: 0n, data: '0x...' }
])

// Quote fee
const quote = await account.quoteSendTransaction({
  to: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  value: 0n,
  data: '0x...'
})
```

### Token Approvals

```javascript
await account.approve({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  spender: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n
})
```

### Transaction Receipts

```javascript
// Get full transaction receipt from a UserOp hash
const receipt = await account.getTransactionReceipt(userOpHash)

// Get the raw UserOperation receipt
const userOpReceipt = await account.getUserOperationReceipt(userOpHash)
```

### Message Signing and Verification

```javascript
// Sign a message
const signature = await account.sign('Hello, EIP-7702!')

// Verify a signature
const isValid = await account.verify('Hello, EIP-7702!', signature)

// Sign typed data (EIP-712)
const typedSig = await account.signTypedData({
  domain: { name: 'MyDApp', version: '1', chainId: 1, verifyingContract: '0x...' },
  types: { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  message: { to: '0x...', amount: '1000000' }
})
```

### Fee Management

```javascript
const feeRates = await wallet.getFeeRates()
console.log('Normal fee rate:', feeRates.normal, 'wei')
console.log('Fast fee rate:', feeRates.fast, 'wei')
```

### Memory Management

```javascript
account.dispose() // Clear private keys from memory
wallet.dispose()  // Dispose all accounts
```

## API Reference

### Table of Contents

| Class | Description |
|-------|-------------|
| [WalletManagerEvmErc7702Gasless](#walletmanagerevmerc7702gasless) | Main class for managing EIP-7702 gasless wallets. Extends `WalletManager`. |
| [WalletAccountEvmErc7702Gasless](#walletaccountevmerc7702gasless) | Individual gasless wallet account. Extends `WalletAccountReadOnlyEvmErc7702Gasless`, implements `IWalletAccount`. |
| [WalletAccountReadOnlyEvmErc7702Gasless](#walletaccountreadonlyevmerc7702gasless) | Read-only wallet account. Extends `WalletAccountReadOnly`. |

### WalletManagerEvmErc7702Gasless

The main class for managing EIP-7702 gasless wallets. Extends `WalletManager` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletManagerEvmErc7702Gasless(seed, config)
```

**Parameters:**
- `seed` (string | Uint8Array): BIP-39 mnemonic seed phrase or seed bytes
- `config` (object): Configuration object

  **Common fields (always required):**
  - `provider` (string | Eip1193Provider): RPC endpoint URL or EIP-1193 provider instance
  - `bundlerUrl` (string): URL of the ERC-4337 bundler/paymaster service

  **Optional:**
  - `delegationAddress` (string): Address of the smart account implementation to delegate to. Defaults to the standard SimpleAccount implementation.
  - `paymasterContext` (object): Provider-specific paymaster context (e.g. `{ sponsorshipPolicyId: "sp_..." }` for Pimlico)

  **Sponsored mode** (gas fees are covered by a paymaster):
  - `isSponsored` (true): Enables sponsorship

  **Paymaster token mode** (pay gas fees with an ERC-20 token):
  - `paymasterToken` (object): `{ address: string }` — the ERC-20 token used for gas payment
  - `transferMaxFee` (number | bigint, optional): Maximum fee for transfer operations

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index)` | Returns a wallet account at the specified index | `Promise<WalletAccountEvmErc7702Gasless>` |
| `getAccountByPath(path)` | Returns a wallet account at the specified BIP-44 derivation path | `Promise<WalletAccountEvmErc7702Gasless>` |
| `getFeeRates()` | Returns current fee rates | `Promise<{normal: bigint, fast: bigint}>` |
| `dispose()` | Disposes all wallet accounts, clearing private keys from memory | `void` |

### WalletAccountEvmErc7702Gasless

Represents an individual EIP-7702 gasless wallet account. Implements `IWalletAccount` from `@tetherto/wdk-wallet`.

#### Constructor

```javascript
new WalletAccountEvmErc7702Gasless(seedOrAccount, path, config)
```

**Parameters:**
- `seedOrAccount` (string | Uint8Array | WalletAccountEvm): BIP-39 seed or an existing `WalletAccountEvm` instance
- `path` (string): BIP-44 derivation path (required when `seedOrAccount` is a seed)
- `config` (object): Same configuration as `WalletManagerEvmErc7702Gasless`

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the EOA address (no Safe, no prediction) | `Promise<string>` |
| `sign(message)` | Signs a message | `Promise<string>` |
| `signTypedData(typedData)` | Signs typed data (EIP-712) | `Promise<string>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `verifyTypedData(typedData, signature)` | Verifies a typed data signature | `Promise<boolean>` |
| `sendTransaction(tx, config?)` | Sends a transaction via UserOperation | `Promise<{hash: string, fee: bigint}>` |
| `quoteSendTransaction(tx, config?)` | Estimates the fee for a UserOperation | `Promise<{fee: bigint}>` |
| `transfer(options, config?)` | Transfers ERC20 tokens via UserOperation | `Promise<{hash: string, fee: bigint}>` |
| `quoteTransfer(options, config?)` | Estimates the fee for an ERC20 transfer | `Promise<{fee: bigint}>` |
| `approve(options)` | Approves a spender for a token amount | `Promise<{hash: string, fee: bigint}>` |
| `getBalance()` | Returns the native token balance (in wei) | `Promise<bigint>` |
| `getTokenBalance(tokenAddress)` | Returns the balance of a specific ERC20 token | `Promise<bigint>` |
| `getTokenBalances(tokenAddresses)` | Returns balances for multiple ERC20 tokens | `Promise<Record<string, bigint>>` |
| `getAllowance(token, spender)` | Returns the current allowance | `Promise<bigint>` |
| `getTransactionReceipt(hash)` | Returns a transaction receipt from a UserOp hash | `Promise<EvmTransactionReceipt \| null>` |
| `getUserOperationReceipt(hash)` | Returns a UserOperation receipt | `Promise<UserOperationReceipt \| null>` |
| `toReadOnlyAccount()` | Returns a read-only copy of the account | `Promise<WalletAccountReadOnlyEvmErc7702Gasless>` |
| `dispose()` | Disposes the wallet account | `void` |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The derivation path's index of this account |
| `path` | `string` | The full derivation path of this account |
| `keyPair` | `object` | The account's key pair (contains sensitive data) |

### WalletAccountReadOnlyEvmErc7702Gasless

Represents a read-only EIP-7702 gasless wallet account. Can query balances and estimate fees but cannot sign or send transactions.

#### Constructor

```javascript
new WalletAccountReadOnlyEvmErc7702Gasless(address, config)
```

**Parameters:**
- `address` (string): The EOA address
- `config` (object): Same configuration as `WalletManagerEvmErc7702Gasless` (excluding `transferMaxFee`)

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the EOA address | `Promise<string>` |
| `getBalance()` | Returns the native token balance (in wei) | `Promise<bigint>` |
| `getTokenBalance(tokenAddress)` | Returns the balance of a specific ERC20 token | `Promise<bigint>` |
| `getTokenBalances(tokenAddresses)` | Returns balances for multiple ERC20 tokens | `Promise<Record<string, bigint>>` |
| `getPaymasterTokenBalance()` | Returns the paymaster token balance | `Promise<bigint>` |
| `quoteSendTransaction(tx, config?)` | Estimates the fee for a UserOperation | `Promise<{fee: bigint}>` |
| `quoteTransfer(options, config?)` | Estimates the fee for an ERC20 transfer | `Promise<{fee: bigint}>` |
| `getAllowance(token, spender)` | Returns the current allowance | `Promise<bigint>` |
| `getTransactionReceipt(hash)` | Returns a transaction receipt from a UserOp hash | `Promise<EvmTransactionReceipt \| null>` |
| `getUserOperationReceipt(hash)` | Returns a UserOperation receipt | `Promise<UserOperationReceipt \| null>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `verifyTypedData(typedData, signature)` | Verifies a typed data signature | `Promise<boolean>` |

## Key Differences from ERC-4337 Module

| Aspect | ERC-4337 (`wdk-wallet-evm-erc-4337`) | ERC-7702 Gasless (this module) |
|--------|---------------------------------------|-------------------------------|
| Smart Account | Safe contract (predicted address) | EOA delegated via EIP-7702 |
| `getAddress()` | Returns Safe contract address | Returns EOA address directly |
| Underlying Library | `@tetherto/wdk-safe-relay-kit` | `permissionless` + `viem` |
| Address Prediction | `predictSafeAddress()` required | No prediction needed |
| Gas Payment | Native coins, paymaster token, sponsored | Sponsored or paymaster token |
| Provider | Pimlico-aware via Safe4337Pack | Provider-agnostic (any ERC-4337 bundler) |
| Chain Requirement | Any EVM with ERC-4337 | Requires Pectra-activated chains (EIP-7702) |

## Supported Networks

This package works with EVM-compatible blockchains that support both EIP-7702 (Pectra upgrade) and ERC-4337:

- **Ethereum Mainnet** (post-Pectra)
- **Ethereum Sepolia** (testnet)
- Other Pectra-activated EVM chains

## Security Considerations

- **Seed Phrase Security**: Always store your seed phrase securely and never share it
- **Private Key Management**: The package handles private keys internally with memory safety features
- **Memory Cleanup**: Use the `dispose()` method to clear private keys from memory when done
- **Fee Limits**: Set `transferMaxFee` to prevent excessive transaction fees
- **Delegation Awareness**: The EOA delegates execution to a smart account implementation — verify the `delegationAddress` is trusted
- **Bundler Security**: Use trusted bundler services and validate UserOperation responses
- **Paymaster Context**: The `paymasterContext` is passed directly to the bundler — ensure it matches your provider's expected format
- **Contract Interactions**: Verify contract addresses and token decimals before transfers

## Development

```bash
# Install dependencies
npm install

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Build TypeScript definitions
npm run build:types
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue on the GitHub repository.

---
