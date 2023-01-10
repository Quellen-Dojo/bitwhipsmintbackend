import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Router } from "express";

import { currentKey, rpcConn } from "..";
import {
  gojiraBlockedTraits,
  landevoBlockedTraits,
  teslerrBlockedTraits,
  treeFiddyBlockedTraits,
} from "../utils/carwash/blockedTraits";
import { GojiraMetadata, LandevoMetadata, TeslerrMetadata, TreeFiddyMetadata } from "../utils/mongo";
import { getMetadataFromMints, validateWallet } from "../utils/utils";

const router = Router();

async function getAllBitWhips(wallet: string, topLevel = false) {
  try {
    const tokenReq = (
      await rpcConn.getParsedTokenAccountsByOwner(new PublicKey(wallet), { programId: TOKEN_PROGRAM_ID }, "confirmed")
    ).value
      .filter((v) => v.account.data.parsed.info.tokenAmount.uiAmount === 1)
      .map((v) => v.account.data.parsed.info.mint);
    return await getMetadataFromMints(tokenReq, topLevel);
  } catch (e) {
    console.log(e);
  }
}

router.get("/getallwhips", async (req, res) => {
  const { wallet, includeTopLevel } = req.query;
  if (validateWallet(wallet as string)) {
    try {
      res.json(await getAllBitWhips(wallet as string, includeTopLevel === "true")).send();
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  } else {
    res.status(400).send();
  }
});

router.get("/easygetallwhips", async (req, res) => {
  const { wallet } = req.query;
  if (validateWallet(wallet as string)) {
    try {
      const tokenReq = await (
        await rpcConn.getParsedTokenAccountsByOwner(
          new PublicKey(wallet as string),
          { programId: TOKEN_PROGRAM_ID },
          "confirmed",
        )
      ).value;

      const tokenMints = tokenReq
        .filter((v) => v.account.data.parsed.info.tokenAmount.uiAmount === 1)
        .map((v) => v.account.data.parsed.info.mint);

      const landevos = (await LandevoMetadata.find({ mintAddress: tokenMints }).exec())
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) => attr.trait_type === "Washed" || landevoBlockedTraits.includes(attr.value),
          );
        });

      const teslerrs = (await TeslerrMetadata.find({ mintAddress: tokenMints }).exec())
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) => attr.trait_type === "Washed" || teslerrBlockedTraits.includes(attr.value),
          );
        });

      const treefiddies = (await TreeFiddyMetadata.find({ mintAddress: tokenMints }).exec())
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) => attr.trait_type === "Washed" || treeFiddyBlockedTraits.includes(attr.value),
          );
        });

      const gojiras = (await GojiraMetadata.find({ mintAddress: tokenMints }).exec())
        .map((doc) => {
          return { mint: doc.mintAddress, ...doc.metadata };
        })
        .filter((car) => {
          return !car.attributes.some(
            (attr) => attr.trait_type === "Washed" || gojiraBlockedTraits.includes(attr.value),
          );
        });

      res.json([...landevos, ...teslerrs, ...treefiddies, ...gojiras]);
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  } else {
    res.status(400).send();
  }
});

router.get("/fulllandevodata", async (req, res) => {
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

router.get("/fullteslerrdata", async (req, res) => {
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

router.get("/fulltreefiddydata", async (req, res) => {
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

router.get("/fullgojiradata", async (req, res) => {
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

export default router;
