import { useEffect, useState } from "react";

import { TezosToolkit } from "@taquito/taquito";

import { Magic } from "magic-sdk";
import { OAuthExtension } from "@magic-ext/oauth";

import { TaquitoExtension } from "@magic-ext/taquito";

import Web3 from "web3";

import { SolanaExtension } from "@magic-ext/solana";
import * as solana from "@solana/web3.js";

import { NearExtension } from "@magic-ext/near";
import * as near from "near-api-js";

//Tezos
import { verifySignature } from "@taquito/utils";
import { toString, fromString } from "uint8arrays";

//Solana
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import { MAGIC_PUBLIC_KEY } from "./config";

const MAGIC_API_KEY = MAGIC_PUBLIC_KEY;

const BLOCKCHAIN = "tezos";

const PROVIDER = "google";

const TEZOS_RPC = "https://mainnet.smartpy.io/";
const POLYGON_RPC = "https://polygon-rpc.com/";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const NEAR_NETWORK = "mainnet"; // testnet, betanet, or mainnet

const magicAuth = new Magic(MAGIC_API_KEY, {
  extensions: [new OAuthExtension()],
});

const EVM = {
  ETHEREUM: 0,
  POLYGON: 1,
};

const magicEvm = ["mainnet", { rpcUrl: POLYGON_RPC, chainId: 137 }].map(
  (network) =>
    new Magic(MAGIC_API_KEY, {
      network,
      extensions: [new OAuthExtension()],
    })
);

const magicTez = new Magic(MAGIC_API_KEY, {
  extensions: [
    new OAuthExtension(),
    new TaquitoExtension({
      rpcUrl: TEZOS_RPC,
    }),
  ],
});

const magicSol = new Magic(MAGIC_API_KEY, {
  extensions: [
    new OAuthExtension(),
    new SolanaExtension({
      rpcUrl: SOLANA_RPC,
    }),
  ],
});

const magicNear = new Magic(MAGIC_API_KEY, {
  extensions: [
    new OAuthExtension(),
    new NearExtension({
      rpcUrl: "", // keep empty... Magic doesn't send transactions
    }),
  ],
});

const web3 = magicEvm.map((magic) => new Web3(magic.rpcProvider));
const Tezos = new TezosToolkit(TEZOS_RPC);
const solConnection = new solana.Connection(SOLANA_RPC); // for sending transactions
const nearConnectingPromise = near.connect({
  networkId: NEAR_NETWORK,
  keyStore: new near.keyStores.BrowserLocalStorageKeyStore(undefined, "magic-"),
  nodeUrl: `https://rpc.${NEAR_NETWORK}.near.org`,
  walletUrl: `https://wallet.${NEAR_NETWORK}.near.org`,
  helperUrl: `https://helper.${NEAR_NETWORK}.near.org`,
  explorerUrl: `https://explorer.${NEAR_NETWORK}.near.org`,
});

const CURRENCY_MAP = {
  tezos: "tez",
  ethereum: "eth",
  polygon: "matic",
  solana: "sol",
  near: "near",
};

const currency = CURRENCY_MAP[BLOCKCHAIN];

const createSigner = {
  evm(chain) {
    return {};
  },
  polygon() {
    return this.evm(EVM.POLYGON);
  },
  ethereum() {
    return this.evm(EVM.ETHEREUM);
  },
  tezos() {
    return magicTez.taquito.createMagicSigner();
  },
  solana() {
    return magicSol.solana; // TODO omit solanaConfig key
  },
  near() {
    return magicNear.near;
  },
};

const getWallet = {
  async evm(chain, signer) {
    return (await web3[chain].eth.getAccounts())[0];
  },
  polygon(signer) {
    return this.evm(EVM.POLYGON, signer);
  },
  ethereum(signer) {
    return this.evm(EVM.ETHEREUM, signer);
  },
  tezos(signer) {
    return signer.publicKeyHash();
  },
  async solana(signer) {
    const metadata = await magicSol.user.getMetadata();
    return metadata.publicAddress;
  },
  async near(signer) {
    const userMetadata = await magicNear.user.getMetadata();
    return userMetadata.publicAddress;
  },
};

const processSigner = {
  evm(chain) {},
  polygon() {
    this.evm(EVM.POLYGON);
  },
  ethereum(signer) {
    this.evm(EVM.ETHEREUM);
  },
  tezos(signer) {
    Tezos.setSignerProvider(signer);
  },
  solana(signer) {},
  near(signer) {},
};

const getBalance = {
  async evm(chain, account) {
    return web3[chain].utils.fromWei(
      await web3[chain].eth.getBalance(account) // Balance is in wei
    );
  },
  polygon(account) {
    return this.evm(EVM.POLYGON, account);
  },
  ethereum(account) {
    return this.evm(EVM.ETHEREUM, account);
  },
  async tezos(account) {
    const bn = await Tezos.tz.getBalance(account);
    return bn.div(1000000).toString();
  },
  async solana(account) {
    const num = await solConnection.getBalance(new solana.PublicKey(account));
    return num.toString();
  },
  async near(address) {
    const nearConnection = await nearConnectingPromise;
    try {
      const account = await nearConnection.account(address);
      const bal = await account.getAccountBalance();
      return near.utils.format.formatNearAmount(bal.total);
    } catch (e) {
      console.log("near error", e);
      const userMetadata = await magicNear.user.getMetadata();
      if (userMetadata.publicAddress !== address) {
        return "0";
      }
      try {
        const pkString = await magicNear.near.getPublicKey();
        const pk = near.utils.key_pair.PublicKey.fromString(pkString);
        await nearConnection.createAccount(`${address}.near`, pk);
      } catch (e) {
        console.log("near error 2", e);
      }
      return "0";
    }
  },
};

const cleanupSigner = {
  evm(chain) {},
  polygon() {
    this.evm(EVM.POLYGON);
  },
  ethereum() {
    this.evm(EVM.ETHEREUM);
  },
  tezos() {
    Tezos.setSignerProvider(undefined);
  },
  solana() {},
  near() {},
};

function encodeTezosMessage(text) {
  const michelinePrefix = "05";
  const stringPrefix = "01";
  const spaces = 10;
  const prefix = "Tezos Signed Message: "; //+
  // reduce(
  //   map(range(spaces), () => "\u2800"),
  //   (acc, current) => acc + current,
  //   ""
  // );
  const len = (
    "0000000" + (prefix.length + 2 * spaces + text.length).toString(16)
  ).slice(-8);

  text = toString(fromString(prefix + text, "utf-8"), "hex");
  return michelinePrefix + stringPrefix + len + text;
}

const message = "a message to sign";

const runSignature = {
  async evm(chain) {
    const account = await getWallet.evm(chain, {});
    const signature = await web3[chain].eth.sign(message, account);
    const recoveredAccount = web3[chain].eth.accounts.recover(
      message,
      signature
    );
    console.log(
      `${account} has signed "${message}" with a signature of ${signature} and it ${
        account === recoveredAccount ? "has" : "hasn't"
      } been verified`
    );
  },
  polygon() {
    this.evm(EVM.POLYGON);
  },
  ethereum() {
    this.evm(EVM.ETHEREUM);
  },
  async tezos() {
    try {
      const encodedMessage = encodeTezosMessage(message);
      const account = await Tezos.signer.publicKeyHash();
      const pk = await Tezos.signer.publicKey();
      const { sig } = await Tezos.signer.sign(encodedMessage);
      const verified = verifySignature(encodedMessage, pk, sig);
      console.log(
        `${account} has signed "${message}" with a signature of ${sig} and it ${
          verified ? "has" : "hasn't"
        } been verified`
      );
    } catch (e) {
      console.log("tezos signature failure", e);
    }
  },
  async solana() {
    try {
      const account = await getWallet.solana({});
      const pk = new solana.PublicKey(account);
      const encodedMessage = decodeUTF8(message);
      const sig = await magicSol.solana.signMessage(encodedMessage);
      const verified = nacl.sign.detached.verify(
        encodedMessage,
        sig,
        pk.toBytes()
      );
      console.log(
        `${account} has signed "${message}" with a signature of ${sig} and it ${
          verified ? "has" : "hasn't"
        } been verified`
      );
    } catch (e) {
      console.log("solana signature failed", e);
    }
  },
  near() {
    console.log(
      "NEAR doesn't support signing a personal message, but we can still sign transactions."
    );
  },
};

const runTransaction = {
  async evm(chain, priority = 1) {
    try {
      const Web3 = web3[chain];
      const account = (await Web3.eth.getAccounts())[0];
      const gasPrice = await Web3.eth.getGasPrice();
      const op = await Web3.eth.sendTransaction({
        from: account,
        to: account,
        value: 1,
        gasPrice,
        maxPriorityFeePerGas: priority,
      });
      console.log(BLOCKCHAIN, "transaction successful", op);
    } catch (e) {
      console.log(BLOCKCHAIN, "transaction failed", e);
    }
  },
  polygon() {
    this.evm(EVM.POLYGON);
  },
  ethereum() {
    this.evm(EVM.ETHEREUM, 3);
  },
  async tezos() {
    try {
      const pkh = await Tezos.signer.publicKeyHash();
      const transaction = Tezos.wallet.transfer({
        amount: 1,
        to: pkh,
        mutez: true,
      });
      const op = await transaction.send();
      const receipt = await op.confirmation(2);
      console.log("tezos transaction successful", receipt);
    } catch (e) {
      console.log("tezos transaction failure", e);
    }
  },
  async solana() {
    try {
      const magic = magicSol;
      const web3 = solana;
      const userMetadata = await magic.user.getMetadata();
      const recipientPubKey = new web3.PublicKey(userMetadata.publicAddress);
      const payer = new web3.PublicKey(userMetadata.publicAddress);

      const hash = await solConnection.getLatestBlockhash();

      let transactionMagic = new web3.Transaction({
        feePayer: payer,
        ...hash,
      });

      const transaction = web3.SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipientPubKey,
        lamports: 0, //sendAmount
      });

      transactionMagic.add(...[transaction]);

      const serializeConfig = {
        requireAllSignatures: false,
        verifySignatures: true,
      };

      const signedTransaction = await magic.solana.signTransaction(
        transactionMagic,
        serializeConfig
      );

      console.log("Signed transaction", signedTransaction);

      const tx = web3.Transaction.from(signedTransaction.rawTransaction);
      const signature = await solConnection.sendRawTransaction(tx.serialize());
      console.log(
        `solana transaction successful https://explorer.solana.com/tx/${signature}?cluster=mainnet`
      );
    } catch (e) {
      console.log("solana transaction failed", e);
    }
  },
  async near() {
    try {
      const nearConnection = await nearConnectingPromise;
      const magic = magicNear;
      // Grab user's public key from Magic
      const publicKeyString = await magic.near.getPublicKey();
      const userMetadata = await magic.user.getMetadata();
      const publicKey = near.utils.PublicKey.fromString(publicKeyString);

      // Calculate the sending account's nonce
      const provider = new near.providers.JsonRpcProvider(
        `https://rpc.${NEAR_NETWORK}.near.org`
      );
      const accessKey = await provider.query(
        `access_key/${userMetadata.publicAddress}/${publicKey.toString()}`,
        ""
      );
      const nonce = ++accessKey.nonce;

      // Calculate `actions`
      const actions = [
        near.transactions.transfer(near.utils.format.parseNearAmount("0")),
      ];

      // Get recent block hash
      const status = await nearConnection.connection.provider.status();
      const blockHash = status.sync_info.latest_block_hash;
      const serializedBlockHash = near.utils.serialize.base_decode(blockHash);

      // Construct transaction object
      const transaction = near.transactions.createTransaction(
        userMetadata.publicAddress,
        publicKey,
        userMetadata.publicAddress,
        nonce,
        actions,
        serializedBlockHash
      );

      const rawTransaction = transaction.encode();
      // Sign raw transaction with Magic
      const result = await magic.near.signTransaction({
        rawTransaction,
        networkID: NEAR_NETWORK,
      });
      const signedTransaction = near.transactions.SignedTransaction.decode(
        Buffer.from(result.encodedSignedTransaction)
      );

      // Send the signed transaction with `near`
      const receipt = await nearConnection.connection.provider.sendTransaction(
        signedTransaction
      );
      console.log("near transaction successful", receipt);
    } catch (e) {
      console.log("near transaction failure", e);
    }
  },
};

const LOGIN_PROVIDER = [
  "google",
  "facebook",
  "apple",
  "github",
  "bitbucket",
  "gitlab",
  "linkedin",
  "twitter",
  "discord",
  "twitch",
  "microsoft",
];

let ran = false;

function App() {
  const [signer, setSigner] = useState();
  const [wallet, setWallet] = useState();
  const [balance, setBalance] = useState();

  useEffect(() => {
    if (ran) {
      return;
    }
    (async () => {
      ran = true;
      const loggedIn = await magicAuth.user.isLoggedIn();
      console.log("logged in:", loggedIn);
      if (loggedIn) {
        const signer = await createSigner[BLOCKCHAIN]();
        console.log("signer set", signer);
        setSigner(signer);
        try {
          // probably want to save in local storage or something persistant
          const userInfo = await magicAuth.oauth.getRedirectResult();
          console.log("processed oauth for", userInfo.magic.userMetadata.email);
        } catch {}
      } else {
        setSigner(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!signer) {
      return;
    }

    const cancelledContainer = { cancelled: false };
    (async () => {
      const account = await getWallet[BLOCKCHAIN](signer);
      if (cancelledContainer.cancelled) {
        return;
      }

      setWallet(account);

      processSigner[BLOCKCHAIN](signer);

      Tezos.setSignerProvider(signer);

      // get balance of the account
      const balance = await getBalance[BLOCKCHAIN](account);
      if (cancelledContainer.cancelled) {
        return;
      }
      setBalance(balance.toString());
    })();
    return () => {
      cancelledContainer.cancelled = true;
      setWallet(undefined);
      setBalance(undefined);
      cleanupSigner[BLOCKCHAIN]();
    };
  }, [signer]);

  return (
    <div className="App">
      <div>
        Available Login Methods:
        <pre>{Object.values(LOGIN_PROVIDER).join("\n")}</pre>
      </div>
      {signer === undefined ? (
        <>Loading</>
      ) : !signer ? (
        <>
          <div>Please login with {PROVIDER}</div>
          <button
            onClick={async () => {
              await magicAuth.oauth.loginWithRedirect({
                provider: PROVIDER,
                redirectURI: window.location.href,
              });
            }}
          >
            Login
          </button>
        </>
      ) : (
        <div>
          {wallet && balance && (
            <div>
              <h4>
                You are logged in as {wallet} and you have {balance} {currency}
              </h4>
              <div>
                <button
                  onClick={() => {
                    runSignature[BLOCKCHAIN]();
                  }}
                >
                  Test Signature
                </button>
              </div>
              <div>
                <button
                  onClick={() => {
                    runTransaction[BLOCKCHAIN]();
                  }}
                >
                  Test Transaction
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setSigner(null);
              magicAuth.user.logout();
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
