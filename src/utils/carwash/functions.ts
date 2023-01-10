import { actions, NodeWallet, programs } from "@metaplex/js";
import * as fs from "fs";
import { IPFSHTTPClient } from "ipfs-http-client";
import sharp from "sharp";

import {
  BASE_IPFS_URL,
  DirtyVersionTable,
  gojiraDirtyVerions,
  landevoDirtyVersions,
  teslerrDirtyVersions,
  treeFiddyDirtyVersions,
} from "../constants";
import { incrementWash, updateNFTMetadataMongo } from "../mongo";
import { CarType, NFTMetadata } from "../types";
const { PublicKey, Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const https = require("https");
require("dotenv").config();

sharp.cache(false);
sharp.concurrency(1);

const {
  metadata: { Metadata },
} = programs;

const treasuryWallet = new NodeWallet(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(process.env.treasuryWallet))));

const rpcConn = new Connection(process.env.rpcEndpoint, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});
const removeWeightRegex = /^([\w\s&]+)/; //bump

function findFileFromTrait(category: string, trait_name: string, carType: CarType) {
  return new Promise((resolve, reject) => {
    fs.readdir(`./dist/layers/${carType}_layers/${category}/`, (err, files) => {
      if (err) {
        reject(`Error locating category ${category}`);
      } else {
        for (const file of files) {
          const matchRes = file.match(removeWeightRegex);
          if (matchRes && matchRes[0] === trait_name) {
            console.log(file);
            resolve(file);
            return;
          }
        }
        reject(`Could not find trait {trait_type: '${category}', value: '${trait_name}'}`);
        return;
      }
    });
  });
}

function sendMessageToDiscord(message: string, username: string, avatarImageUrl = "") {
  const discordMsg = https.request(process.env.discordWebhook, {
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

async function getCleanVersion(category: string, trait_name: string, carType: CarType) {
  let cleanTable: DirtyVersionTable;
  switch (carType) {
    case "landevo":
      cleanTable = landevoDirtyVersions;
      break;
    case "teslerr":
      cleanTable = teslerrDirtyVersions;
      break;
    case "treefiddy":
      cleanTable = treeFiddyDirtyVersions;
      break;
    case "gojira":
      cleanTable = gojiraDirtyVerions;
      break;
  }

  if (cleanTable) {
    if (cleanTable[category]) {
      for (const [cleanTrait, array] of Object.entries(cleanTable[category])) {
        if (array.includes(trait_name)) {
          return cleanTrait;
        }
      }
    }
  } else {
    throw new Error("cleanTable was never set! (getCleanVerison)");
  }
  return trait_name;
}

export async function generateCleanUploadAndUpdate(
  metadata: NFTMetadata,
  carType: CarType,
  IPFSClient: IPFSHTTPClient,
) {
  const pureNewAttributes = [];
  const mintAddress = metadata.mint;
  const imageSources: sharp.OverlayOptions[] = [];
  for (const trait of metadata["attributes"]) {
    const cleanVersionTrait = await getCleanVersion(trait["trait_type"], trait["value"], carType);
    const imagePath =
      `./dist/layers/${carType}_layers/` +
      trait["trait_type"] +
      "/" +
      (await findFileFromTrait(trait["trait_type"], cleanVersionTrait, carType));
    imageSources.push();

    const image = fs.readFileSync(imagePath);

    const sharpOption: sharp.OverlayOptions = {
      input: image,
      blend: "add",
    };

    imageSources.push(sharpOption);

    pureNewAttributes.push({
      trait_type: trait["trait_type"],
      value: cleanVersionTrait,
    });
  }

  const washedLayer = fs.readFileSync(`./dist/layers/${carType}_layers/Washed/Washed.png`);
  const washedSource: sharp.OverlayOptions = {
    input: washedLayer,
    blend: "add",
  };

  imageSources.push(washedSource);

  const finalComposite = sharp({
    create: {
      width: 1000,
      height: 1000,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
      channels: 3,
    },
  }).composite(imageSources);

  const imageBuff = await finalComposite.png().toBuffer();

  // fs.writeFileSync(`./debugOutput/${mintAddress}.png`, imageBuff);

  pureNewAttributes.push({
    trait_type: "Washed",
    value: `Ticket Number: ${await incrementWash()}`,
  });

  const ipfsPNGCID = await IPFSClient.add(imageBuff, { pin: true });
  const pngV0CIDStr = ipfsPNGCID.cid.toV0().toString();
  console.log(`IPFS PNG CID: ${pngV0CIDStr}`);

  const imageLink = `${BASE_IPFS_URL}/${pngV0CIDStr}`;

  metadata["attributes"] = pureNewAttributes;
  metadata["image"] = imageLink;

  sendMessageToDiscord(`New Car washed! ${imageLink}`, "Car Wash Notifications");

  metadata["properties"]["files"][0]["uri"] = imageLink;
  delete metadata.mint;

  const newJSONCID = await IPFSClient.add(JSON.stringify(metadata), {
    pin: true,
  });
  console.log(`JSON CID: ${newJSONCID.cid.toV0().toString()}`);

  const mintAddressPublicKey = new PublicKey(mintAddress);
  const topLevelMetadata = await Metadata.load(rpcConn, await Metadata.getPDA(mintAddressPublicKey));
  const topLevelDataData = topLevelMetadata.data.data;
  topLevelDataData.uri = `${BASE_IPFS_URL}/${newJSONCID.cid.toV0().toString()}`;
  const updateSig = await actions.updateMetadata({
    connection: rpcConn,
    wallet: treasuryWallet,
    editionMint: mintAddressPublicKey,
    newMetadataData: topLevelDataData,
  });

  console.log(`Update sig for ${mintAddress}: ${updateSig}`);

  await updateNFTMetadataMongo(mintAddress!, metadata, carType);

  return;
}
