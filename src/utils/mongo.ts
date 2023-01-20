import mongoose from "mongoose";

import type { CarType, NFTMetadata } from "./types";

require("dotenv").config();

mongoose.connect(
  `mongodb+srv://quellen:${process.env.mongopass}@cluster0.jxtal.mongodb.net/dojodb?retryWrites=true&w=majority`,
);

const Schema = mongoose.Schema;

const carwashCountDoc = process.env.carwashCountDoc;

const DiscordLinkSchema = new Schema({
  discordId: String,
  wallet: String,
});

const HolderSchema = new Schema({
  discordId: String,
  wallet: String,
});

const CarwashCountSchema = new Schema({
  amount: Number,
});

const NFTMetadataSchema = new Schema<{
  mintAddress: string;
  metadata: NFTMetadata;
}>({
  mintAddress: String,
  metadata: Object,
});

export const BWDiscordLink = mongoose.model("BitwhipsDiscordLink", DiscordLinkSchema);
export const BWHolderLink = mongoose.model("BitwhipsHolderLink", HolderSchema);

export const CarwashCount = mongoose.model("CarwashCount", CarwashCountSchema);
export const LandevoMetadata = mongoose.model("LandevoMetadata", NFTMetadataSchema);
export const TeslerrMetadata = mongoose.model("TeslerrMetadata", NFTMetadataSchema);
export const TreeFiddyMetadata = mongoose.model("TreeFiddyMetadata", NFTMetadataSchema);
export const GojiraMetadata = mongoose.model("GojiraMetadata", NFTMetadataSchema);

export async function getNumberInModel(model: mongoose.Model<any>) {
  return await model.estimatedDocumentCount().exec();
}

export function incrementWash() {
  return new Promise((resolve, reject) => {
    CarwashCount.findById(carwashCountDoc, async (err: unknown | undefined, doc: { amount: number }) => {
      if (err) {
        reject("Cannot find document");
      } else {
        const newVal = doc.amount + 1;
        await CarwashCount.updateOne({ _id: carwashCountDoc }, { amount: newVal }).exec();
        resolve(newVal);
      }
    });
  });
}

export async function createLandevoMetadataMongo(
  mint: string,
  metadata: NFTMetadata,
  model: mongoose.Model<{ mintAddress: string; metadata: NFTMetadata }>,
) {
  if (!(await model.findOne({ mintAddress: mint }).exec())) {
    await model.create({ mintAddress: mint, metadata: metadata });
    console.log(`Created metadata for #${metadata.edition}`);
  }
}

export async function updateNFTMetadataMongo(mint: string, newmetadata: NFTMetadata, carType: CarType) {
  let res;
  switch (carType) {
    case "landevo":
      res = await LandevoMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
      break;
    case "teslerr":
      res = await TeslerrMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
      break;
    case "treefiddy":
      res = await TreeFiddyMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
      break;
    case "gojira":
      res = await GojiraMetadata.updateOne({ mintAddress: mint }, { metadata: newmetadata }).exec();
      break;
  }
  return res;
}
