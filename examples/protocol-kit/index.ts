import { ethers } from 'ethers'
import EthersAdapter from '@safe-global/safe-ethers-lib'
import SafeServiceClient from '@safe-global/safe-service-client'
import Safe, { SafeFactory, SafeAccountConfig } from '@safe-global/safe-core-sdk'
import { SafeTransaction, SafeTransactionDataPartial } from '@safe-global/safe-core-sdk-types'

// Run this file:
// source examples/.env
// npx ts-node examples/protocol-kit/index.ts

// Initialize Objects needed for the SDK

// https://chainlist.org/?search=goerli&testnets=true
const RPC_URL='https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

// Initialize signers

// Create a wallet instance from the sender's private key
const owner1Signer = new ethers.Wallet(process.env.OWNER_1_PRIVATE_KEY!, provider)
const owner2Signer = new ethers.Wallet(process.env.OWNER_2_PRIVATE_KEY!, provider)
const owner3Signer = new ethers.Wallet(process.env.OWNER_3_PRIVATE_KEY!, provider)

const ethAdapterOwner1 = new EthersAdapter({
  ethers,
  signerOrProvider: owner1Signer
})

const txServiceUrl = 'https://safe-transaction-goerli.safe.global'
const safeService = new SafeServiceClient({ txServiceUrl, ethAdapter: ethAdapterOwner1 })
let safeFactory: SafeFactory;
let safeSdkOwner1: Safe;
let safeAddress: string;

// If you have an existing Safe, you can use it instead of deploying a new one
const EXISTING_SAFE_ADDRESS ='0xF188d41FD181f94960C5451D7ff6FdbcDf201a71';

async function deploySafe() {
  console.log('Deploying Safe...')
  safeFactory = await SafeFactory.create({ ethAdapter: ethAdapterOwner1 })

  const safeAccountConfig: SafeAccountConfig = {
    owners: [
      await owner1Signer.getAddress(),
      await owner2Signer.getAddress(),
      await owner3Signer.getAddress()
    ],
    threshold: 2,
    // ... (Optional params) 
    // https://github.com/safe-global/safe-core-sdk/tree/main/packages/safe-core-sdk#deploysafe
  }

  /* This Safe is connected to owner 1 because the factory was initialized 
  with an adapter that had owner 1 as the signer. */
  safeSdkOwner1 = await safeFactory.deploySafe({ safeAccountConfig })

  safeAddress = safeSdkOwner1.getAddress()

  console.log('Your Safe has been deployed:')
  console.log(`https://goerli.etherscan.io/address/${safeAddress}`)
  console.log(`https://app.safe.global/gor:/${safeAddress}`)
}

async function initalizeSafe(existingAddress=EXISTING_SAFE_ADDRESS) {
  
  safeAddress = existingAddress
  const ethAdapterOwner1 = new EthersAdapter({
    ethers,
    signerOrProvider: owner1Signer
  })

  safeSdkOwner1 = await Safe.create({
    ethAdapter: ethAdapterOwner1,
    safeAddress
  })
}

async function depositToSafe(depositSigner = owner1Signer, amount = '0.1') {

  const safeAmount = ethers.utils.parseUnits(amount, 'ether').toHexString()
  
  const transactionParameters = {
    to: safeAddress,
    value: safeAmount
  }
  
  const tx = await depositSigner.sendTransaction(transactionParameters)
  
  console.log('Fundraising.')
  console.log(`Deposit Transaction: https://goerli.etherscan.io/tx/${tx.hash}`)
}

async function createTransaction(withdrawAmount = '0.05') {
  // Any address can be used. In this example we will use vitalik.eth
  const destination = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  withdrawAmount = ethers.utils.parseUnits(withdrawAmount, 'ether').toString()

  const safeTransactionData: SafeTransactionDataPartial = {
    to: destination,
    data: '0x',
    value: withdrawAmount
  }
  // Create a Safe transaction with the provided parameters
  const safeTransaction = await safeSdkOwner1.createTransaction({ safeTransactionData })
  
  return safeTransaction
}

async function proposeTransaction(safeTransaction: SafeTransaction) {
  // Deterministic hash based on transaction parameters
  const safeTxHash = await safeSdkOwner1.getTransactionHash(safeTransaction)

  // Sign transaction to verify that the transaction is coming from owner 1
  const senderSignature = await safeSdkOwner1.signTransactionHash(safeTxHash)

  await safeService.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: await owner1Signer.getAddress(),
    senderSignature: senderSignature.data,
  })
}

async function getPendingTransactions() {
  const pendingTransactions = (await safeService.getPendingTransactions(safeAddress)).results
  console.log('Pending Transactions: ', pendingTransactions)
  return pendingTransactions
}

async function confirmTransaction() {

  const pendingTxs = await getPendingTransactions();
  const transaction = pendingTxs[0]
  const safeTxHash = transaction.safeTxHash

  const ethAdapterOwner2 = new EthersAdapter({
    ethers,
    signerOrProvider: owner2Signer
  })

  const safeSdkOwner2 = await Safe.create({
    ethAdapter: ethAdapterOwner2,
    safeAddress
  })

  const signature = await safeSdkOwner2.signTransactionHash(safeTxHash)
  const response = await safeService.confirmTransaction(safeTxHash, signature.data)

  console.log('Transaction confirmed:', response)
  return {safeTxHash, confirmationResponse: response}
}

async function executeTransaction(safeTxHash: string, safeSdk: Safe = safeSdkOwner1) {

  let safeBalance = await safeSdk.getBalance()

  console.log(`[Before Transaction] Safe Balance: ${ethers.utils.formatUnits(safeBalance, 'ether')} ETH`)

  const safeTransaction = await safeService.getTransaction(safeTxHash)
  const executeTxResponse = await safeSdk.executeTransaction(safeTransaction)

  const receipt = await executeTxResponse.transactionResponse?.wait()

  console.log('Transaction executed:')
  console.log(`https://goerli.etherscan.io/tx/${receipt?.transactionHash}`)

  safeBalance = await safeSdk.getBalance()

  
  console.log(`[After Transaction] Safe Balance: ${ethers.utils.formatUnits(safeBalance, 'ether')} ETH`)
}

async function main() {

  if (EXISTING_SAFE_ADDRESS) {
    await initalizeSafe()
  } else {
    await deploySafe()
    await depositToSafe()
  }
  const safeTransaction = await createTransaction()
  await proposeTransaction(safeTransaction)
  const { safeTxHash } = await confirmTransaction();
  await executeTransaction(safeTxHash)

  // Run the following to re-execute transactions:
  // const pendingTxs = await getPendingTransactions();
  // const transaction = pendingTxs[0]
  // const safeTxHash = transaction.safeTxHash
  // console.log({safeTxHash})
  // executeTransaction(safeTxHash, safeSdkOwner1)
}

main()