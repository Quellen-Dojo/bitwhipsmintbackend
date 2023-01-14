import { programs } from "@metaplex/js";
import { PublicKey } from "@solana/web3.js";
import { https } from "follow-redirects";

import { rpcConn } from "..";
import { NFTMetadata, TxnTokenBalance } from "./types";

const {
  metadata: { Metadata },
} = programs;

export function sendMessageToDiscord(message: string, username: string, avatarImageUrl = "") {
  const discordMsg = https.request(process.env.discordWebhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  discordMsg.write(
    JSON.stringify({
      username: username,
      avatar_url: avatarImageUrl,
      content: message,
    }),
  );
  discordMsg.end();
}

export function sendHolderMessageToDiscord(message: string, username: string, avatarImageUrl = "") {
  const discordMsg = https.request(process.env.holderWebhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  discordMsg.write(
    JSON.stringify({
      username: username,
      avatar_url: avatarImageUrl,
      content: message,
    }),
  );
  discordMsg.end();
}

export function postRequest<T>(url: string, payload: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const arReq = https.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
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
    });
    arReq.write(JSON.stringify(payload));
    arReq.end();
  });
}

export function redirectThroughArweave<T>(url: string) {
  return new Promise<T | null>((resolve, reject) => {
    https.get(url, { headers: { "Content-Type": "application/json" } }, (res) => {
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
    });
  });
}

export async function fetchMetadataOfToken(mintAddress: string) {
  const topLevel = await Metadata.load(rpcConn, await Metadata.getPDA(new PublicKey(mintAddress)));
  return await redirectThroughArweave<NFTMetadata>(topLevel.data.data.uri);
}

//TODO: Validate by testing against the network
export function validateWallet(wallet: string) {
  //In base58, there is no 0, O, l, or I in the wallet string.
  const walletRegex = /^[\w^0OIl]{43,44}$/g; //44-length string with only alphanumeric characters and not the above characters
  return walletRegex.test(wallet);
}

export async function getMetadataFromMints(mints: string[], topLevel = false) {
  const appendTopLevelMetadata = (data: NFTMetadata, mint: string, topLevel: boolean) => {
    if (!topLevel) {
      return data;
    } else {
      data["mint"] = mint;
    }
    return data;
  };

  const whips = [];
  for (const mint of mints) {
    try {
      const tokenMeta = await Metadata.load(rpcConn, await Metadata.getPDA(mint));
      if (verifyMetadata(tokenMeta)) {
        const jsonMeta = await redirectThroughArweave<NFTMetadata>(tokenMeta.data.data.uri);
        if (!jsonMeta) {
          continue;
        }
        whips.push(appendTopLevelMetadata(jsonMeta, mint, topLevel));
      }
    } catch (e) {
      continue;
    }
  }

  return whips;
}

/**
 * Verify that the metadata from a BitWhip actually belongs to BitWhips
 */
export function verifyMetadata(metadata: typeof Metadata.prototype) {
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
      metadata.data.data.creators.filter((v) => !allowedOwners.includes(v.address)).length > 0 ||
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

export async function retryGetTransaction(signature: string, retries = 4) {
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateTxnTransferAmounts(
  preTokenBalances: TxnTokenBalance,
  postTokenBalances: TxnTokenBalance,
  lamports: number,
) {
  const fromSent =
    parseInt(preTokenBalances[0].uiTokenAmount.amount) - parseInt(postTokenBalances[0].uiTokenAmount.amount) ===
    lamports;
  const toSent =
    parseInt(postTokenBalances[1].uiTokenAmount.amount) - parseInt(preTokenBalances[1].uiTokenAmount.amount) ===
    lamports;
  return toSent && fromSent;
}
