import { Connection } from "@solana/web3.js";
import express from "express";
import { NFTStorage } from "nft.storage";

import carwashRoutes from "./endpoints/carwash";
import discordRoutes from "./endpoints/discord";
import miscRoutes from "./endpoints/miscellaneous";
import nftRoutes from "./endpoints/nft";

require("dotenv").config();
const cors = require("cors");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(discordRoutes);
app.use(miscRoutes);
app.use(nftRoutes);
app.use(carwashRoutes);

export const carwashCountDoc = process.env.carwashCountDoc;
export const currentKey = process.env.accessKey;
export const NFT_STORAGE_KEY = process.env.NFT_STORAGE_KEY!;

export const nftStorage = new NFTStorage({ token: NFT_STORAGE_KEY });

export const rpcConn = new Connection(process.env.rpcEndpoint!, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});

app.listen(process.env.PORT || 3002, () => console.log("Listening..."));
