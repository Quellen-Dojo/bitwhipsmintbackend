import { Connection } from "@solana/web3.js";
import express from "express";
import * as IPFS from "ipfs-http-client";

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

export const IPFSClient = IPFS.create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
  headers: {
    authorization:
      "Basic " +
      Buffer.from(process.env.infuraIPFSProjectID + ":" + process.env.infuraIPFSProjectSecret).toString("base64"),
  },
  apiPath: "/api/v0",
});

export const rpcConn = new Connection(process.env.rpcEndpoint!, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});

app.listen(process.env.PORT || 3002, () => console.log("Listening..."));
