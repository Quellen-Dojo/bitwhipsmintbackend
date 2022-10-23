import { Router } from "express";

import { currentKey } from "..";
import { createLandevoMetadataMongo, GojiraMetadata } from "../utils/mongo";
import { fetchMetadataOfToken } from "../utils/utils";

const router = Router();

router.get("/ping", async (req, res) => {
  res.send("Pong!");
});

router.post("/ping", (req, res) => {
  res.send("Pong!");
});

router.post("/submit", async (req, res) => {
  const { list, key } = req.body;
  if (key === currentKey) {
    for (const mint of list) {
      try {
        if ((await GojiraMetadata.findOne({ mintAddress: mint }).exec()) == null) {
          const metadata = await fetchMetadataOfToken(mint);
          if (!metadata) {
            throw new Error(`Could not load metadata for ${mint}`);
          }
          await createLandevoMetadataMongo(mint, metadata, GojiraMetadata);
        }
      } catch (e) {
        console.log(`Error with ${mint}`);
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

export default router;
