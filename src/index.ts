import {
  BWDiscordLink,
  BWHolderLink,
  CarwashCount,
  createLandevoMetadataMongo,
  getNumberInModel,
  GojiraMetadata,
  LandevoMetadata,
  TeslerrMetadata,
  TreeFiddyMetadata,
} from "./utils/mongo";
import { https } from "follow-redirects";
import { DiamondVaultAPIResponse, NFTMetadata } from "./utils/types";
import { Connection, PublicKey } from "@solana/web3.js";
import express from "express";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { generateCleanUploadAndUpdate } from "./utils/carwash/functions";
import bs58 from "bs58";
import { programs } from "@metaplex/js";
import { metadata } from "@metaplex/js/lib/programs";
import * as fs from "fs";
import {
  gojiraBlockedTraits,
  landevoBlockedTraits,
  teslerrBlockedTraits,
  treeFiddyBlockedTraits,
} from "./utils/carwash/blockedTraits";

require("dotenv").config();
const cors = require("cors");
const app = express();
const DiscordOAuth = require("discord-oauth2");
const tweetnacl = require("tweetnacl");
const IPFS = require("ipfs-http-client");

const carwashCountDoc = process.env.carwashCountDoc;

const {
  metadata: { Metadata },
} = programs;

// Test
const whitelistSpots = 700;

const IPFSClient = IPFS.create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
  headers: {
    authorization:
      "Basic " +
      Buffer.from(
        process.env.infuraIPFSProjectID +
          ":" +
          process.env.infuraIPFSProjectSecret
      ).toString("base64"),
  },
  apiPath: "/api/v0",
});

const rpcConn = new Connection(process.env.rpcEndpoint!, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});

let currentKey = process.env.accessKey;

/**
 *
 * @param {string} mintAddress
 */
async function fetchMetadataOfToken(mintAddress: string) {
  const topLevel = await Metadata.load(
    rpcConn,
    await Metadata.getPDA(new PublicKey(mintAddress))
  );
  return await redirectThroughArweave(topLevel.data.data.uri);
}

//TODO: Validate by testing against the network
function validateWallet(wallet: string) {
  //In base58, there is no 0, O, l, or I in the wallet string.
  const walletRegex = /^[\w^0OIl]{43,44}$/g; //44-length string with only alphanumeric characters and not the above characters
  return walletRegex.test(wallet);
}

function sendMessageToDiscord(
  message: string,
  username: string,
  avatarImageUrl = ""
) {
  const discordMsg = https.request(process.env.discordWebhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  discordMsg.write(
    JSON.stringify({
      username: username,
      avatar_url: avatarImageUrl,
      content: message,
    })
  );
  discordMsg.end();
}

function sendHolderMessageToDiscord(
  message: string,
  username: string,
  avatarImageUrl = ""
) {
  const discordMsg = https.request(process.env.holderWebhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  discordMsg.write(
    JSON.stringify({
      username: username,
      avatar_url: avatarImageUrl,
      content: message,
    })
  );
  discordMsg.end();
}

//Check if discord link already exists
async function checkDiscordLink(discordId: string, wallet = null) {
  let ret: { exists: boolean; wallet?: string } = {
    exists: false,
    wallet: undefined,
  };
  let dataRes = await BWDiscordLink.findOne({ discordId: discordId }).exec();
  if (wallet && dataRes === null) {
    dataRes = await BWDiscordLink.findOne({ wallet: wallet }).exec();
  }
  if (dataRes) {
    ret["exists"] = true;
    ret["wallet"] = dataRes.wallet;
  }
  return ret;
}

function postRequest(url: string, payload: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const arReq = https.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        try {
          let data = "";
          res.on("data", (d) => (data += d.toString()));
          res.on("error", () => reject());
          res.on("end", () => {
            resolve(JSON.parse(data));
          });
        } catch (e) {
          console.log(e);
          reject();
        }
      }
    );
    arReq.write(JSON.stringify(payload));
    arReq.end();
  });
}

function redirectThroughArweave(url: string) {
  return new Promise<any | null>((resolve, reject) => {
    https.get(
      url,
      { headers: { "Content-Type": "application/json" } },
      (res) => {
        try {
          let data = "";
          res.on("data", (d) => (data += d.toString()));
          res.on("error", () => reject(null));
          res.on("end", () => {
            const resolved = JSON.parse(data);
            resolve(resolved);
          });
        } catch {
          reject(null);
        }
      }
    );
  });
}

/**
 * Verify that the metadata from a BitWhip actually belongs to BitWhips
 */
function verifyMetadata(metadata: typeof Metadata.prototype) {
  if (!metadata.data.data.creators) {
    return false;
  }

  const allowedOwners = [
    "CCw23HjhwKxxwCKdV3QUQt4XYGcQNLJPCm9rek3wkcNo", // Treasury
    "Ek4Q2tAt3vyhyN59G1EGUxRSZzYwnLSNDrYKF8AsLsNH", // Royalties
    "GXLsCeRw6Gz6o1zGewy951GgKnZHn7k4go6g9HmHjFvh", // Series 1 Candy Machine
    "D2aTkRnffuSDaoqzAEHsD4xYfutk3bVpK93uMcuFxw65", // Series 2 Candy Machine
  ];

  let valid = true;
  try {
    if (
      metadata.data.data.creators.filter(
        (v) => !allowedOwners.includes(v.address)
      ).length > 0 ||
      metadata.data.updateAuthority !== allowedOwners[0]
    ) {
      valid = false;
    }
  } catch (e) {
    console.log(e);
    return false;
  }
  return valid;
}

function getAllMetadataFromArrayOfMints(mints: string[], topLevel = false) {
  const appendTopLevelMetadata = (
    data: NFTMetadata,
    mint: string,
    topLevel: boolean
  ) => {
    if (!topLevel) {
      return data;
    } else {
      data["mint"] = mint;
    }
    return data;
  };

  return new Promise(async (resolve, reject) => {
    try {
      const BitWhips = [];
      for (const mint of mints) {
        try {
          const tokenMeta = await Metadata.load(
            rpcConn,
            await Metadata.getPDA(mint)
          );
          if (verifyMetadata(tokenMeta)) {
            BitWhips.push(
              appendTopLevelMetadata(
                await redirectThroughArweave(tokenMeta.data.data.uri),
                mint,
                topLevel
              )
            );
          }
        } catch (e) {
          // console.log(`Error in grabbing metadata for ${hash}: ${e}\nThis is most likely NOT a BitWhip, or even an NFT`);
          continue;
        }
      }
      console.log(`Wallet has ${BitWhips.length} BitWhips`);
      resolve(BitWhips);
    } catch (e2) {
      console.log(`Error in grabbing metadata from list: ${e2}`);
      reject();
    }
  });
}

async function getAllBitWhips(wallet: string, topLevel = false) {
  try {
    const tokenReq = (
      await rpcConn.getParsedTokenAccountsByOwner(
        new PublicKey(wallet),
        { programId: TOKEN_PROGRAM_ID },
        "confirmed"
      )
    ).value
      .filter((v) => v.account.data.parsed.info.tokenAmount.uiAmount === 1)
      .map((v) => v.account.data.parsed.info.mint);
    return await getAllMetadataFromArrayOfMints(tokenReq, topLevel);
  } catch (e) {
    console.log(e);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryGetTransaction(signature: string, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const txn = await rpcConn.getTransaction(signature);
      console.log(txn);
      if (txn) {
        return txn;
      }
    } catch (e) {
      // console.log(e);
    }
    await sleep(1000);
  }
  throw new Error("Could not grab transaction!");
}

type TxnTokenBalance = { uiTokenAmount: { amount: string } }[];

function validateTxnTransferAmounts(
  preTokenBalances: TxnTokenBalance,
  postTokenBalances: TxnTokenBalance,
  lamports: number
) {
  const fromSent =
    parseInt(preTokenBalances[0].uiTokenAmount.amount) -
      parseInt(postTokenBalances[0].uiTokenAmount.amount) ===
    lamports;
  const toSent =
    parseInt(postTokenBalances[1].uiTokenAmount.amount) -
      parseInt(preTokenBalances[1].uiTokenAmount.amount) ===
    lamports;
  return toSent && fromSent;
}

/**
 *
 * @param {string} wallet
 * @returns {Promise<[number, string[]]>}
 */
async function getNumOfBitWhipsInitial(wallet: string) {
  const pubkey = new PublicKey(wallet);
  const accs = (
    await rpcConn.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;
  const tokenMints: string[] = accs
    .filter((v) => v.account.data.parsed.info.tokenAmount.amount > 0)
    .map((v) => v.account.data.parsed.info.mint);

  let numOf = 0;
  let mints = [];
  for (const mint of tokenMints) {
    try {
      const meta = await Metadata.load(rpcConn, await Metadata.getPDA(mint));
      if (verifyMetadata(meta)) {
        numOf += 1;
        mints.push(mint);
      }
    } catch {}
  }
  return [numOf, mints];
}

async function getNumOfBitWhipsRecheck(wallet: string) {
  const accs = (
    await rpcConn.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;
  const tokenMints: string[] = accs
    .filter((v) => v.account.data.parsed.info.tokenAmount.amount > 0)
    .map((v) => v.account.data.parsed.info.mint);

  return (
    (await LandevoMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await TeslerrMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await TreeFiddyMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await GojiraMetadata.find({ mintAddress: tokenMints }).exec()).length
  );
}

function verifySignature(msg: string, pubKey: string, signature: string) {
  return tweetnacl.sign.detached.verify(
    new TextEncoder().encode(msg),
    bs58.decode(signature),
    bs58.decode(pubKey)
  );
}

app.use(cors());
app.use(express.json());

app.get("/ping", async (req, res) => {
  // res.json((await BWDiscordLink.find({ discordId: ['416430897894522890', '733199983288909824'] }).exec()).map(v => v.wallet)).send();
  res.send("Pong!");
});

app.post("/ping", (req, res) => {
  res.send("Pong!");
});

app.post("/submit", async (req, res) => {
  const { list, key } = req.body;
  if (key === currentKey) {
    for (const hash of list) {
      try {
        if (
          (await GojiraMetadata.findOne({ mintAddress: hash }).exec()) == null
        ) {
          const metadata = await fetchMetadataOfToken(hash);
          await createLandevoMetadataMongo(hash, metadata, GojiraMetadata);
        }
      } catch (e) {
        console.log(`Error with ${hash}`);
        console.log(e);
        continue;
      }
    }
    console.log("Done!");
    res.status(200).send();
  } else {
    res.status(403);
  }
});

app.get("/holderstatus", async (req, res) => {
  const { wallet, signature } = req.query;
  if (
    wallet &&
    signature &&
    verifySignature(
      "I AM MY BITWHIP AND MY BITWHIP IS ME!",
      wallet as string,
      signature as string
    )
  ) {
    res.json({
      valid: (await BWHolderLink.findOne({ wallet: wallet }).exec()) != null,
    });
  } else {
    res.json({ valid: false });
  }
});

app.get("/holderdiscordcheck", async (req, res) => {
  try {
    const oauth2 = new DiscordOAuth();

    const { code } = req.query;

    console.log(code);

    if (code) {
      const tokenRes = await oauth2.tokenRequest({
        clientId: "940761522781683793",
        redirectUri: process.env.toolVerifRedirect,
        clientSecret: process.env.holderVerifSecret,
        code: code,
        grantType: "authorization_code",
        scope: "identify",
      });
      const accessToken = tokenRes.access_token;
      const user = await oauth2.getUser(accessToken);
      const userId = user.id;
      if (await BWDiscordLink.findOne({ discordId: userId }).exec()) {
        res.json({ valid: true });
      } else {
        res.json({ valid: false });
      }

      res.status(500).send();
    } else {
      res.status(500).send();
    }
  } catch (e) {
    console.log(e);
    res.status(500).send();
  }
});

app.get("/dolphinstatus", async (req, res) => {
  const { wallet, signature } = req.query;
  if (
    wallet &&
    signature &&
    verifySignature(
      "I AM MY BITWHIP AND MY BITWHIP IS ME!",
      wallet as string,
      signature as string
    ) &&
    (await getNumOfBitWhipsRecheck(wallet as string)) >= 5
  ) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

app.post("/recheckHolders", async (req, res) => {
  const { key } = req.body;
  if (key === currentKey) {
    let validRes: { [discordId: string]: number } = {};
    let invalidRes: string[] = [];
    let staked: DiamondVaultAPIResponse | undefined;
    try {
      staked = await postRequest(
        "https://us-central1-nft-anybodies.cloudfunctions.net/API_V2_GetVaultStakerData",
        { data: { vaultId: process.env.stakedVaultId } }
      );
    } catch {}

    const holderDocs = await BWHolderLink.find({}).exec();
    for (const doc of holderDocs) {
      let holdingNum = await getNumOfBitWhipsRecheck(doc.wallet!);
      if (staked) {
        const stakedEntry = staked.filter((v) => v["_id"] === doc.wallet);
        if (stakedEntry.length > 0) {
          holdingNum += stakedEntry[0]["Tokens"].length;
        }
      }
      if (holdingNum > 0) {
        validRes[doc.discordId!] = holdingNum;
      } else {
        invalidRes.push(doc.discordId!);
        await BWHolderLink.deleteMany({ wallet: doc.wallet }).exec();
      }
    }
    res.json({ valid: validRes, invalid: invalidRes });
  } else {
    res.status(401);
  }
});

app.post("/submitForHolderVerif", async (req, res) => {
  const { discordId, wallet, signature } = req.body;
  const jsonRes: { error: boolean; success: boolean } = {
    error: false,
    success: false,
  };
  console.log(`Holder Verif: ${discordId} ${wallet} ${signature}`);
  if (
    discordId &&
    wallet &&
    verifySignature("I AM MY BITWHIP AND MY BITWHIP IS ME!", wallet, signature)
  ) {
    try {
      const walletCheckRes = await BWHolderLink.findOne({
        discordId: discordId,
      }).exec();
      if (walletCheckRes) {
        await BWHolderLink.updateMany(
          { discordId: discordId },
          { discordId: discordId, wallet: wallet }
        ).exec();
      } else {
        await BWHolderLink.create({ discordId: discordId, wallet: wallet });
        let staked: DiamondVaultAPIResponse | undefined;
        try {
          staked = await postRequest(
            "https://us-central1-nft-anybodies.cloudfunctions.net/API_V2_GetVaultStakerData",
            { data: { vaultId: process.env.stakedVaultId } }
          );
        } catch {}
        let holdingNum = await getNumOfBitWhipsRecheck(wallet);
        if (staked) {
          const stakedEntry = staked.filter((v) => v["_id"] === wallet);
          if (stakedEntry.length > 0) {
            holdingNum += stakedEntry[0]["Tokens"].length;
          }
        }
        if (holdingNum > 0) {
          // Submit Request to update roles.
          sendHolderMessageToDiscord(
            `${discordId} ${wallet} ${signature} ${holdingNum}`,
            "Holder Verification"
          );
        }
      }
      jsonRes.success = true;
    } catch (e) {
      console.log(e);
      jsonRes.error = true;
    }
    res.json(jsonRes);
  } else {
    res.status(400);
  }
});

app.get("/washedcars", async (req, res) => {
  try {
    const washedcars = (await CarwashCount.findOne({
      _id: carwashCountDoc,
    }).exec())!.amount;
    res.json({ amount: washedcars }).send();
  } catch {
    res.status(500).send();
  }
});

app.get("/fulllandevodata", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    try {
      const metadataList = [];
      const docs = await LandevoMetadata.find({}).exec();
      for (const doc of docs) {
        metadataList.push(doc.metadata);
      }
      res.json(metadataList).send();
    } catch {
      res.status(500).send();
    }
  } else {
    res.status(403).send();
  }
});

app.get("/fullteslerrdata", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    try {
      const metadataList = [];
      const docs = await TeslerrMetadata.find({}).exec();
      for (const doc of docs) {
        metadataList.push(doc.metadata);
      }
      res.json(metadataList).send();
    } catch {
      res.status(500).send();
    }
  } else {
    res.status(403).send();
  }
});

app.get("/fulltreefiddydata", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    try {
      const metadataList = [];
      const docs = await TreeFiddyMetadata.find({}).exec();
      for (const doc of docs) {
        metadataList.push(doc.metadata);
      }
      res.json(metadataList).send();
    } catch {
      res.status(500).send();
    }
  } else {
    res.status(403).send();
  }
});

app.get("/fullgojiradata", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    try {
      const metadataList = [];
      const docs = await GojiraMetadata.find({}).exec();
      for (const doc of docs) {
        metadataList.push(doc.metadata);
      }
      res.json(metadataList).send();
    } catch {
      res.status(500).send();
    }
  } else {
    res.status(403).send();
  }
});

app.post("/processcarwash", async (req, res) => {
  const { signature, nft, fromWallet, type } = req.body;
  try {
    await sleep(2000);
    console.log(await rpcConn.confirmTransaction(signature, "confirmed"));
    const txn = await retryGetTransaction(signature);
    const tokenMeta = await fetchMetadataOfToken(nft.mint);
    tokenMeta["mint"] = nft.mint;
    console.log(txn);
    const [from, fromAta, to] = txn.transaction.message.accountKeys;
    console.log(`From: ${from.toBase58()}`);
    console.log(`To: ${to.toBase58()}`);
    const { postTokenBalances, preTokenBalances } = txn.meta!;
    // Full price 200000000
    // Debug price: 1000000
    if (
      validateTxnTransferAmounts(
        preTokenBalances as TxnTokenBalance,
        postTokenBalances as TxnTokenBalance,
        100 * 10 ** 9
      ) &&
      // to.toBase58() === "H3WkH9HCWFP7jXN12RnJHZmis6ymv8yAx8jYQNTX4sHU" &&
      fromWallet === from.toBase58() &&
      !tokenMeta["Washed"]
    ) {
      //update metadata here!
      try {
        await generateCleanUploadAndUpdate(tokenMeta, type, IPFSClient);
        res.status(200).send();
      } catch (generationError) {
        console.log(generationError);
        sendMessageToDiscord(
          `<@&898643399299694622> <@&900148882489634836> **SERIOUS ERROR WITH THE CARWASH**\n\nTxn Signature: ${signature}\n\nMint Address: ${nft.mint}\n\nWe may have to refund this transaction!\n\n${generationError}`,
          "Car Wash Notifications"
        );
        res.status(500).send();
      }
    } else {
      res.status(304).send();
    }
  } catch (e) {
    console.log(e);
    sendMessageToDiscord(
      `ERROR WITH CAR WASH: ${e}\n\nSignature (if exists): ${signature}`,
      "Car Wash Notifications"
    );
    res.status(500).send();
  }
});

app.get("/getallwhips", async (req, res) => {
  const { wallet, username, includeTopLevel } = req.query;
  if (validateWallet(wallet as string)) {
    try {
      res
        .json(
          await getAllBitWhips(wallet as string, includeTopLevel === "true")
        )
        .send();
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  } else {
    res.status(400).send();
  }
});

app.get("/easygetallwhips", async (req, res) => {
  const { wallet, username, includeTopLevel } = req.query;
  if (validateWallet(wallet as string)) {
    try {
      const tokenReq = await (
        await rpcConn.getParsedTokenAccountsByOwner(
          new PublicKey(wallet as string),
          { programId: TOKEN_PROGRAM_ID },
          "confirmed"
        )
      ).value;

      const tokenMints = tokenReq
        .filter((v) => v.account.data.parsed.info.tokenAmount.uiAmount === 1)
        .map((v) => v.account.data.parsed.info.mint);

      const landevos = (
        await LandevoMetadata.find({ mintAddress: tokenMints }).exec()
      )
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) =>
              attr.trait_type === "Washed" ||
              landevoBlockedTraits.includes(attr.value)
          );
        });

      const teslerrs = (
        await TeslerrMetadata.find({ mintAddress: tokenMints }).exec()
      )
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) =>
              attr.trait_type === "Washed" ||
              teslerrBlockedTraits.includes(attr.value)
          );
        });

      const treefiddies = (
        await TreeFiddyMetadata.find({ mintAddress: tokenMints }).exec()
      )
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) =>
              attr.trait_type === "Washed" ||
              treeFiddyBlockedTraits.includes(attr.value)
          );
        });

      const gojiras = (
        await GojiraMetadata.find({ mintAddress: tokenMints }).exec()
      )
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) =>
              attr.trait_type === "Washed" ||
              gojiraBlockedTraits.includes(attr.value)
          );
        });

      res.json([...landevos, ...teslerrs, ...treefiddies, ...gojiras]);
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  } else {
    res.status(400).send();
  }
});

app.get("/getlinks", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    BWDiscordLink.find((err, doc) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(doc.map((v) => v.wallet)).send();
        res.status(200).send();
      }
    });
  } else {
    res.status(401).send();
  }
});

app.post("/manualdiscwalletlink", async (req, res) => {
  const { key, discordId, wallet } = req.body;
  if (key === currentKey) {
    try {
      const existingDiscEntry = await BWDiscordLink.findOne({
        discordId: discordId,
      }).exec();
      const existingWalletEntry = await BWDiscordLink.findOne({
        wallet: wallet,
      }).exec();
      if (!existingDiscEntry && !existingWalletEntry) {
        await BWDiscordLink.create({
          discordId: discordId.toString(),
          wallet: wallet,
        });
        res.status(200).send();
      } else {
        res.status(409).send();
      }
    } catch {
      res.status(500).send();
    }
  } else {
    res.status(403).send();
  }
});

app.get("/islinkedtodiscord", async (req, res) => {
  const { key, discordId } = req.query;
  if (key === currentKey) {
    res.json(await checkDiscordLink(discordId as string)).send();
  } else {
    res.status(401).send();
  }
});

app.get("/getlinkeddiscords", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    BWDiscordLink.find((err, doc) => {
      if (err) {
        res.status(500).send();
      } else {
        res.json(doc.map((v) => v.discordId)).send();
      }
    });
  } else {
    res.status(401).send();
  }
});

app.post("/getIdFromCode", async (req, res) => {
  try {
    const oauth2 = new DiscordOAuth({
      clientId: "940761522781683793",
      clientSecret: process.env.holderVerifSecret,
      redirectUri: process.env.holderVerifRedirect,
      requestTimeout: 10000,
    });

    const { code } = req.body;

    if (code) {
      const tokenRes = await oauth2.tokenRequest({
        code: code,
        grantType: "authorization_code",
        scope: "identify",
      });
      const accessToken = tokenRes.access_token;
      const user = await oauth2.getUser(accessToken);

      res
        .json({
          discordId: user.id,
          username: `${user.username}#${user.discriminator}`,
        })
        .send();
    } else {
      res.status(400).send();
    }
  } catch (e) {
    res.status(500).send();
  }
});

app.post("/linkdiscord", async (req, res) => {
  const { discordId, wallet, key } = req.body;
  try {
    if (key === currentKey) {
      const checkRes = await checkDiscordLink(discordId, wallet);
      const whitelistedNum = await getNumberInModel(BWDiscordLink);
      const jsonRes: {
        exists: boolean;
        wallet?: string;
        created: boolean;
        closed: boolean;
      } = {
        exists: false,
        wallet: undefined,
        created: false,
        closed: false,
      };
      if (whitelistedNum < whitelistSpots) {
        if (checkRes.exists) {
          jsonRes["exists"] = true;
          jsonRes["wallet"] = checkRes["wallet"];
          res.json(jsonRes).send();
        } else {
          await BWDiscordLink.create({ discordId: discordId, wallet: wallet });
          jsonRes["wallet"] = wallet;
          jsonRes["created"] = true;
          res.json(jsonRes).send();
        }
      } else {
        jsonRes["closed"] = true;
        res.json(jsonRes).send();
      }
    } else {
      res.status(401).send();
    }
  } catch {
    res.status(500).send();
  }
});

app.post("/unlinkdiscord", async (req, res) => {
  const { key, discordId } = req.body;
  if (key === currentKey && discordId) {
    const dataRes = await BWDiscordLink.findOne({
      discordId: discordId,
    }).exec();
    if (dataRes) {
      await BWDiscordLink.deleteMany({ discordId: discordId }).exec();
      res.status(200).send();
    } else {
      res.status(404).send();
    }
  } else {
    res.status(401).send();
  }
});

app.get("/walletbydiscord", async (req, res) => {
  const { key, id } = req.query;
  if (key === currentKey) {
    const wRes = await BWDiscordLink.findOne({ discordId: id }).exec();
    if (wRes) {
      res.json({ wallet: wRes.wallet }).send();
    } else {
      res.status(404).send();
    }
  } else {
    res.status(401).send();
  }
});

app.get("/discordbywallet", async (req, res) => {
  const { key, wallet } = req.query;
  if (key === currentKey) {
    const thing = await BWDiscordLink.findOne({ wallet }).exec();
    if (thing) {
      res.json({ wallet: thing.discordId });
    } else {
      res.json({ wallet: null });
    }
  } else {
    res.status(401).send();
  }
});

app.get("/getstats", async (req, res) => {
  const { key } = req.query;
  if (key === currentKey) {
    try {
      const numWhitelists = await getNumberInModel(BWDiscordLink);
      const numAirdrops = await getNumberInModel(BWDiscordLink);
      res.json({ whitelists: numWhitelists, airdrops: numAirdrops }).send();
    } catch (e) {
      res.status(500).send();
    }
  } else {
    res.status(401).send();
  }
});

app.post("/rollkey", async (req, res) => {
  const { key, newKey } = req.body;
  if (key === currentKey) {
    currentKey = newKey;
  }
});

app.listen(process.env.PORT || 3002, () => console.log("Listening..."));
