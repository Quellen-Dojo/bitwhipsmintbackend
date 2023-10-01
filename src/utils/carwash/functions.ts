import { actions, NodeWallet, programs } from "@metaplex/js";
import bs58 from "bs58";
import { fetch as cfetch } from "cross-fetch";
import dotenv from "dotenv";
import { https } from "follow-redirects";
import sharp from "sharp";

import {
  DirtyVersionTable,
  gojiraDirtyVerions,
  landevoDirtyVersions,
  teslerrDirtyVersions,
  treeFiddyDirtyVersions,
} from "../constants";
import { incrementWash, updateNFTMetadataMongo } from "../mongo";
import { CarType, NFTMetadata } from "../types";
import { uploadFileToInternet } from "../utils";

dotenv.config();

const { PublicKey, Connection, Keypair } = require("@solana/web3.js");

sharp.cache(false);
sharp.concurrency(1);

const {
  metadata: { Metadata },
} = programs;

const TARGET_IMAGE_SIZE = 1000; // 1000x1000

const treasuryWallet = new NodeWallet(Keypair.fromSecretKey(Uint8Array.from(bs58.decode(process.env.treasuryWallet!))));

const AWS_URL = process.env.AWS_LAYER_URL;

const rpcConn = new Connection(process.env.rpcEndpoint, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});

function sendMessageToDiscord(message: string, username: string, avatarImageUrl = "") {
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

const formatStringForAWS = (item: string) => item.replace(" ", "+");

const fetchImage = async (url: string) => {
  const req = await cfetch(url);
  const arrayBuff = await req.arrayBuffer();
  return Buffer.from(arrayBuff);
};

export async function generateCleanUploadAndUpdate(metadata: NFTMetadata, carType: CarType) {
  const pureNewAttributes = [];
  const mintAddress = metadata.mint;
  const imageSources: sharp.OverlayOptions[] = [];
  for (const trait of metadata["attributes"]) {
    const cleanVersionTrait = await getCleanVersion(trait["trait_type"], trait["value"], carType);

    const imageUrl = `${AWS_URL}/${carType}_layers/${formatStringForAWS(trait.trait_type)}/${formatStringForAWS(
      cleanVersionTrait,
    )}.png`;

    const imageRes = await fetchImage(imageUrl);
    const imageSharp = await sharp(imageRes).resize({ height: TARGET_IMAGE_SIZE, width: TARGET_IMAGE_SIZE }).toBuffer();

    const sharpOption: sharp.OverlayOptions = {
      input: imageSharp,
      blend: "over",
    };

    imageSources.push(sharpOption);

    pureNewAttributes.push({
      trait_type: trait["trait_type"],
      value: cleanVersionTrait,
    });
  }

  const washedLayer = await fetchImage(`${AWS_URL}/${carType}_layers/Washed/Washed.png`);
  const washedSource: sharp.OverlayOptions = {
    input: washedLayer,
    blend: "over",
  };

  imageSources.push(washedSource);

  const finalComposite = sharp({
    create: {
      width: TARGET_IMAGE_SIZE,
      height: TARGET_IMAGE_SIZE,
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

  const imageLink = await uploadFileToInternet(imageBuff, "image/png");

  metadata["attributes"] = pureNewAttributes;
  metadata["image"] = imageLink;

  sendMessageToDiscord(`New Car washed! ${imageLink}`, "Car Wash Notifications");

  metadata["properties"]["files"][0]["uri"] = imageLink;
  delete metadata.mint;

  const mintAddressPublicKey = new PublicKey(mintAddress);
  const topLevelMetadata = await Metadata.load(rpcConn, await Metadata.getPDA(mintAddressPublicKey));
  const topLevelDataData = topLevelMetadata.data.data;
  topLevelDataData.uri = await uploadFileToInternet(JSON.stringify(metadata), "application/json");
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
