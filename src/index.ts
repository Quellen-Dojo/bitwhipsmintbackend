import { Connection } from "@solana/web3.js";
import express from "express";
import { registerCarMetadataEndpoints } from "./endpoints/data-providers/car-metadata";
import { registerDiscordEnpoints } from "./endpoints/discord-functions/discord-functions";
import { registerCarwashEndpoints } from "./endpoints/carwash/carwash";

require("dotenv").config();
const cors = require("cors");
const app = express();
const IPFS = require("ipfs-http-client");

export const whitelistSpots = 700;

export const IPFSClient = IPFS.create({
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

export const rpcConn = new Connection(process.env.rpcEndpoint!, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 100000,
});

app.use(cors());
app.use(express.json());

registerCarMetadataEndpoints(app);
registerDiscordEnpoints(app);
registerCarwashEndpoints(app);

app.get("/ping", async (req, res) => {
  res.send("Pong!");
});

app.post("/ping", (req, res) => {
  res.send("Pong!");
});

app.listen(process.env.PORT || 3002, () => console.log("Listening..."));
