// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'

import { createPublicClient, defineChain, http } from 'viem'
import { createBundlerClient } from 'viem/account-abstraction'

import { JsonRpcProvider } from 'ethers'

import { ConfigurationError } from './errors.js'

/** @typedef {import('ethers').Eip1193Provider} Eip1193Provider */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet-evm').TypedData} TypedData */

/** @typedef {import('viem').PublicClient} PublicClient */
/** @typedef {import('viem').Chain} ViemChain */
/** @typedef {import('viem/account-abstraction').BundlerClient} BundlerClient */

/**
 * @typedef {Object} Evm7702GaslessWalletCommonConfig
 * @property {string | Eip1193Provider} provider - The url of the rpc provider, or an instance of a class that implements eip-1193.
 * @property {string} bundlerUrl - The url of the bundler/paymaster service.
 * @property {string} [paymasterUrl] - The url of the paymaster service if different from bundlerUrl (e.g. for Candide which uses separate endpoints).
 * @property {string} [delegationAddress] - The address of the smart account implementation to delegate to. If not provided, permissionless.js defaults to the standard SimpleAccount implementation.
 */

/**
 * @typedef {Object} Evm7702GaslessSponsorshipPolicyConfig
 * @property {true} isSponsored - Whether the paymaster is sponsoring the account.
 * @property {false} [useNativeCoins] - Whether to use native coins for gas payment.
 * @property {Object} [paymasterContext] - Provider-specific paymaster context (e.g. { sponsorshipPolicyId } for Pimlico).
 */

/**
 * @typedef {Object} Evm7702GaslessPaymasterTokenConfig
 * @property {false} [isSponsored] - Whether the paymaster is sponsoring the account.
 * @property {false} [useNativeCoins] - Whether to use native coins for gas payment.
 * @property {Object} paymasterToken - The paymaster token configuration.
 * @property {string} paymasterToken.address - The address of the paymaster token.
 * @property {Object} [paymasterContext] - Provider-specific paymaster context.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 */

/**
 * @typedef {Evm7702GaslessWalletCommonConfig &
 *  (Evm7702GaslessSponsorshipPolicyConfig |
 *   Evm7702GaslessPaymasterTokenConfig)} Evm7702GaslessWalletConfig
 */

/**
 * @typedef {Object} UserOperationReceipt
 * @property {string} userOpHash - The user operation hash.
 * @property {string} [transactionHash] - The transaction hash.
 * @property {boolean} success - Whether the user operation was successful.
 */

export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
  /**
   * Creates a new read-only evm 7702 gasless wallet account.
   *
   * @param {string} address - The evm account's address (the EOA address directly).
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration object.
   */
  constructor (address, config) {
    super(address)

    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>}
     */
    this._config = config

    /**
     * Cached viem clients.
     *
     * @protected
     * @type {{ publicClient: PublicClient, bundlerClient: BundlerClient, chain: ViemChain } | null}
     */
    this._viemClients = null

    /**
     * The chain id.
     *
     * @protected
     * @type {bigint | undefined}
     */
    this._chainId = undefined

    /**
     * The owner account address.
     *
     * @protected
     * @type {string}
     */
    this._ownerAccountAddress = address
  }

  /**
   * Returns the account's eth balance.
   *
   * @returns {Promise<bigint>} The eth balance (in weis).
   */
  async getBalance () {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getBalance()
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getTokenBalance(tokenAddress)
  }

  /**
   * Returns the account balances for multiple tokens.
   *
   * @param {string[]} tokenAddresses - The smart contract addresses of the tokens.
   * @returns {Promise<Record<string, bigint>>} A mapping of token addresses to their balances (in base units).
   */
  async getTokenBalances (tokenAddresses) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getTokenBalances(tokenAddresses)
  }

  /**
   * Returns the account's balance for the paymaster token provided in the wallet account configuration.
   *
   * @returns {Promise<bigint>} The paymaster token balance (in base unit).
   */
  async getPaymasterTokenBalance () {
    const { paymasterToken } = this._config

    if (!paymasterToken) {
      throw new Error('Paymaster token is not configured.')
    }

    return await this.getTokenBalance(paymasterToken.address)
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction (tx, config) {
    const mergedConfig = { ...this._config, ...config }

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored } = mergedConfig

    if (isSponsored) {
      return { fee: 0n }
    }

    const fee = await this._getUserOperationGasCost([tx].flat(), mergedConfig)

    return { fee: BigInt(fee) }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer (options, config) {
    const tx = await WalletAccountReadOnlyEvm._getTransferTransaction(options)

    const result = await this.quoteSendTransaction(tx, config)

    return result
  }

  /**
   * Returns a transaction's receipt.
   *
   * @param {string} hash - The user operation hash.
   * @returns {Promise<EvmTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    const { bundlerClient } = await this._getViemClients()

    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    let userOpReceipt
    try {
      userOpReceipt = await bundlerClient.getUserOperationReceipt({ hash })
    } catch {
      return null
    }

    if (!userOpReceipt || !userOpReceipt.receipt?.transactionHash) {
      return null
    }

    return await evmReadOnlyAccount.getTransactionReceipt(userOpReceipt.receipt.transactionHash)
  }

  /**
   * Returns a user operation's receipt.
   *
   * @param {string} hash - The user operation hash.
   * @returns {Promise<UserOperationReceipt | null>} The receipt, or null if the user operation has not been included in a block yet.
   */
  async getUserOperationReceipt (hash) {
    const { bundlerClient } = await this._getViemClients()

    try {
      const receipt = await bundlerClient.getUserOperationReceipt({ hash })
      return receipt
    } catch {
      return null
    }
  }

  /**
   * Returns the current allowance for the given token and spender.
   *
   * @param {string} token - The token's address.
   * @param {string} spender - The spender's address.
   * @returns {Promise<bigint>} The allowance.
   */
  async getAllowance (token, spender) {
    const readOnlyAccount = await this._getEvmReadOnlyAccount()

    return await readOnlyAccount.getAllowance(token, spender)
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(this._ownerAccountAddress, this._config)
    return await evmReadOnlyAccount.verify(message, signature)
  }

  /**
   * Verifies a typed data signature.
   *
   * @param {TypedData} typedData - The typed data to verify.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verifyTypedData (typedData, signature) {
    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(this._ownerAccountAddress, this._config)

    return await evmReadOnlyAccount.verifyTypedData(typedData, signature)
  }

  /**
   * Validates the configuration to ensure all required fields are present.
   *
   * @protected
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration to validate.
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
   * @returns {void}
   */
  _validateConfig (config) {
    const { provider, bundlerUrl, isSponsored, paymasterToken } = config
    const missingFields = []

    if (!provider) {
      missingFields.push('provider')
    }

    if (!bundlerUrl) {
      missingFields.push('bundlerUrl')
    }

    if (missingFields.length > 0) {
      throw new ConfigurationError(`Missing required configuration fields: ${missingFields.join(', ')}.`)
    }

    if (!isSponsored) {
      if (!paymasterToken) {
        throw new ConfigurationError('Missing required paymaster token configuration fields: paymasterToken.')
      }
    }
  }

  /**
   * Returns cached viem clients (publicClient + bundlerClient).
   *
   * @protected
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} [config] - The configuration object. Defaults to this._config if not provided.
   * @returns {Promise<{ publicClient: PublicClient, bundlerClient: BundlerClient, chain: ViemChain }>}
   */
  async _getViemClients (config = this._config) {
    if (!this._viemClients) {
      const chainId = await this._getChainId()

      const chain = defineChain({
        id: Number(chainId),
        name: `chain-${chainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [typeof config.provider === 'string' ? config.provider : ''] }
        }
      })

      const publicClient = createPublicClient({
        chain,
        transport: http(typeof config.provider === 'string' ? config.provider : undefined)
      })

      const bundlerClient = createBundlerClient({
        chain,
        transport: http(config.bundlerUrl),
        client: publicClient
      })

      this._viemClients = { publicClient, bundlerClient, chain }
    }

    return this._viemClients
  }

  /**
   * Returns the chain id.
   *
   * @protected
   * @returns {Promise<bigint>} The chain id.
   */
  async _getChainId () {
    if (!this._chainId) {
      const providerUrl = typeof this._config.provider === 'string' ? this._config.provider : undefined
      const provider = new JsonRpcProvider(providerUrl)
      const { chainId } = await provider.getNetwork()
      this._chainId = chainId
    }

    return this._chainId
  }

  /** @private */
  async _getEvmReadOnlyAccount () {
    const address = await this.getAddress()

    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(address, this._config)

    return evmReadOnlyAccount
  }

  /** @private */
  async _getUserOperationGasCost (txs, config) {
    const { publicClient, bundlerClient } = await this._getViemClients(config)

    const address = await this.getAddress()

    const calls = txs.map(tx => ({
      to: tx.to,
      data: tx.data || '0x',
      value: BigInt(tx.value || 0)
    }))

    try {
      const gasEstimate = await bundlerClient.estimateUserOperationGas({
        account: address,
        calls
      })

      const {
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        paymasterVerificationGasLimit,
        paymasterPostOpGasLimit
      } = gasEstimate

      const fees = await publicClient.estimateFeesPerGas()

      const totalGas = (callGasLimit || 0n) +
        (verificationGasLimit || 0n) +
        (preVerificationGas || 0n) +
        (paymasterVerificationGasLimit || 0n) +
        (paymasterPostOpGasLimit || 0n)

      return totalGas * fees.maxFeePerGas
    } catch (error) {
      if (error.message.includes('AA50')) {
        throw new Error('Simulation failed: not enough funds in the account to repay the paymaster.')
      }

      throw error
    }
  }
}
