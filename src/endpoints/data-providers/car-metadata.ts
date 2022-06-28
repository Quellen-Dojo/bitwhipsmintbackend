import { Express } from "express";
import { rpcConn } from "../..";
import {
  CarwashCount,
  createLandevoMetadataMongo,
  GojiraMetadata,
  LandevoMetadata,
  TeslerrMetadata,
  TreeFiddyMetadata,
} from "../../utils/mongo";
import { fetchMetadataOfToken } from "../../utils/utils";

export const registerCarMetadataEndpoints = (app: Express) => {
  require("dotenv").config();
  const currentKey = process.env.accessKey;

  app.get("/washedcars", async (req, res) => {
    const carwashCountDoc = process.env.carwashCountDoc;
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

  app.post("/submit", async (req, res) => {
    const { list, key } = req.body;
    if (key === currentKey) {
      for (const hash of list) {
        try {
          if (!(await GojiraMetadata.findOne({ mintAddress: hash }).exec())) {
            const metadata = await fetchMetadataOfToken(hash, rpcConn);
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
};
