require('dotenv').config();
const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const oneSplitAbi = require("./abis/1splitabi.json");
const erc20Abi = require("./abis/erc20abi.json");
const DexesList = require("./exchangesList");
const ethWeiDecimals = 18;
const providerString = process.env.HTTP_PROVIDER;
const provider = new Web3.providers.HttpProvider(providerString);

var web3 = new Web3(provider);

var fromAddress  = process.env.FROM_ADDRESS
var privateKey = process.env.PRIVATE_KEY;
var toTokenAddress = process.env.TO_TOKEN_ADDRESS; // Eth
var fromTokenAddress = process.env.FROM_TOKEN_ADDRESS; // Dai
var oneSplitAddress = process.env.ONESPLIT_ADDRESS;
var amountToSwap = 1;
var amountToSwapWei = new BigNumber(amountToSwap).shiftedBy(ethWeiDecimals);
var expectedSwap = null;

var OneSplitContract = new web3.eth.Contract(oneSplitAbi, oneSplitAddress);
var DaiContract = new web3.eth.Contract(erc20Abi, fromTokenAddress);

async function getExpectedReturn() {
  await OneSplitContract.methods
    .getExpectedReturn(
      fromTokenAddress,
      toTokenAddress,
      new BigNumber(amountToSwap).shiftedBy(ethWeiDecimals),
      100,
      0
    )
    .call({}, async (err, res) => {
      if (err) console.error(err);
      expectedSwap = res;
      console.log(`
        from: ${fromTokenAddress}
        to: ${toTokenAddress}
        amount: ${amountToSwap}
        returnAmount: ${new BigNumber(res.returnAmount)
          .shiftedBy(-ethWeiDecimals)
          .toString()}
    `);
      DexesList.forEach((dex, i) => {
        console.log(`${dex}: ${res.distribution[i]}%`);
      });
      await approveSpender();
    });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function awaitTransaction(tx) {
  var receipt = null;
  do {
    await web3.eth.getTransactionReceipt(tx).then(res => {
      if (res) receipt = res;
      wait(2000);
    });
  } while (receipt === null);
  console.log(`Transactions went successfull: ${receipt.transactioHash}`);
  return receipt.status;
}

async function approveSpender(){
  try {
    var txData = await DaiContract.methods
    .approve(oneSplitAddress, amountToSwapWei)
    .encodeABI();
    var rawTx = {
      to : toTokenAddress,
      from : fromAddress,
      data: txData,
      gas: 99999999,
      chainId: 1,
    }
    var signedTransaction = await web3.eth.accounts.signedTransaction(
      rawTx,
      privateKey
    )
    await web3.eth
    .sendSignedTransaction(signedTransaction.rawTransaction)
    .then(console.log("Dai Spending Approved"))
    await awaitTransaction(signedTransaction.transactionHash);
    await executeSwap();
  } catch (error) {
    console.log("There Was An Error",error);
  }
}

function fromWeiConvertor(amount) {
  return new BigNumber(amount).shiftedBy(-ethWeiDecimals).toFixed(2);
}
async function connectMetaMask() {
  if (window.ethereum) { // Check if MetaMask is installed
      try {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }); // Request account access
          const account = accounts[0]; // Get the first account
          console.log('Connected account:', account);
          // You can now use this account to interact with the blockchain
      } catch (error) {
          console.error('User denied account access');
      }
  } else {
      console.log('MetaMask is not installed');
  }
}

async function executeSwap() {
  // eth and dai balances before the swap
  var ethBefore = await web3.eth.getBalance(fromAddress);
  var daiBefore = await DaiContract.methods.balanceOf(fromAddress).call();

  await OneSplitContract.methods
    .swap(
      fromTokenAddress,
      toTokenAddress,
      amountToSwapWei,
      expectedSwap.returnAmount,
      expectedSwap.distribution,
      0
    )
    .send({ from: fromAddress, gas: 9999999 }, async (err, tx) => {
      if (err) console.log(`The swap couldn't be executed: ${err}`);
      await awaitTransaction(tx);
      // eth & dai balances after the swap
      var ethAfter = await web3.eth.getBalance(fromAddress);
      var daiAfter = await DaiContract.methods.balanceOf(fromAddress).call();

      console.log(`
            The swap went successfull.
            
            Balances before: ${fromWeiConvertor(
              ethBefore
            )} - ${fromWeiConvertor(daiBefore)}
            Balances after: ${fromWeiConvertor(ethAfter)} - ${fromWeiConvertor(
        daiAfter
      )}`);
    });
}
connectMetaMask();
getExpectedReturn();
