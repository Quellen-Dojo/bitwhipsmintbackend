import { actions, NodeWallet, programs } from "@metaplex/js";
import { Canvas, Image } from "canvas";
import * as fs from "fs";
import { IPFSHTTPClient } from "ipfs-http-client";
import mergeImages from "merge-images";

import {
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
  const imageSources = [];
  for (const trait of metadata["attributes"]) {
    const cleanVersionTrait = await getCleanVersion(trait["trait_type"], trait["value"], carType);
    imageSources.push(
      `./dist/layers/${carType}_layers/` +
        trait["trait_type"] +
        "/" +
        (await findFileFromTrait(trait["trait_type"], cleanVersionTrait, carType)),
    );
    pureNewAttributes.push({
      trait_type: trait["trait_type"],
      value: cleanVersionTrait,
    });
  }

  imageSources.push(`./dist/layers/${carType}_layers/Washed/Washed.png`);

  const newImage = await mergeImages(imageSources, {
    Canvas: Canvas,
    Image: Image,
  });
  const imageData = newImage.replace(/^data:image\/png;base64,/, "");
  const imageBuff = Buffer.from(imageData, "base64");

  // fs.writeFileSync(`./debugOutput/${mintAddress}.png`, imageBuff);

  pureNewAttributes.push({
    trait_type: "Washed",
    value: `Ticket Number: ${await incrementWash()}`,
  });

  const ipfsPNGCID = await IPFSClient.add(imageBuff, { pin: true });
  const pngV0CIDStr = ipfsPNGCID.cid.toV0().toString();
  console.log(`IPFS PNG CID: ${pngV0CIDStr}`);

  metadata["attributes"] = pureNewAttributes;
  metadata["image"] = "https://ipfs.infura.io/ipfs/" + pngV0CIDStr;

  sendMessageToDiscord(`New Car washed! ${"https://ipfs.infura.io/ipfs/" + pngV0CIDStr}`, "Car Wash Notifications");

  metadata["properties"]["files"][0]["uri"] = "https://ipfs.infura.io/ipfs/" + pngV0CIDStr;
  delete metadata.mint;

  const newJSONCID = await IPFSClient.add(JSON.stringify(metadata), {
    pin: true,
  });
  console.log(`JSON CID: ${newJSONCID.cid.toV0().toString()}`);

  const mintAddressPublicKey = new PublicKey(mintAddress);
  const topLevelMetadata = await Metadata.load(rpcConn, await Metadata.getPDA(mintAddressPublicKey));
  const topLevelDataData = topLevelMetadata.data.data;
  topLevelDataData.uri = "https://ipfs.infura.io/ipfs/" + newJSONCID.cid.toV0().toString();
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
