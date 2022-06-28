import {
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Express } from "express";
import { IPFSClient, rpcConn } from "../..";
import { TREASURY_CLNT_ACCOUNT, CLNT_MINT } from "../../utils/constants";
import {
  LandevoMetadata,
  TeslerrMetadata,
  TreeFiddyMetadata,
  GojiraMetadata,
} from "../../utils/mongo";
import {
  sleep,
  fetchMetadataOfToken,
  sendMessageToDiscord,
} from "../../utils/utils";
import { retryGetTransaction, generateCleanUploadAndUpdate } from "./utils";
import { validateTxnAmount } from "./validateTransferTxn";

export const registerCarwashEndpoints = (app: Express) => {
  require("dotenv").config();
  const currentKey = process.env.accessKey;
  app.post("/processcarwash", async (req, res) => {
    const { signature, nft, fromWallet, type } = req.body;
    try {
      await sleep(2000);
      console.log(await rpcConn.confirmTransaction(signature, "confirmed"));
      const txn = await retryGetTransaction(signature);
      const tokenMeta = await fetchMetadataOfToken(nft.mint, rpcConn);
      tokenMeta["mint"] = nft.mint;
      if (
        txn &&
        (await validateTxnAmount(
          txn,
          rpcConn,
          100,
          TREASURY_CLNT_ACCOUNT,
          await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            CLNT_MINT,
            new PublicKey(fromWallet)
          ),
          CLNT_MINT
        )) &&
        !tokenMeta["Washed"]
      ) {
        //update metadata here!
        try {
          await generateCleanUploadAndUpdate(tokenMeta, type, IPFSClient);
          res.status(200).send();
        } catch (generationError) {
          console.log(generationError);
          sendMessageToDiscord(
            `<@&898643399299694622> <@&900148882489634836> **SERIOUS ERROR WITH THE CARWASH**\n\nTxn Signature: ${signature}\n\nMint Address: ${nft.mint}\n\nWe may have to refund this transaction!\n\n${generationError}`,
            "Car Wash Notifications"
          );
          res.status(500).send();
        }
      } else {
        res.status(304).send();
      }
    } catch (e) {
      console.log(e);
      sendMessageToDiscord(
        `ERROR WITH CAR WASH: ${e}\n\nSignature (if exists): ${signature}`,
        "Car Wash Notifications"
      );
      res.status(500).send();
    }
  });

  app.get("/easygetallwhips", async (req, res) => {
    const { wallet, username, includeTopLevel } = req.query;
    if (await rpcConn.getAccountInfo(new PublicKey(wallet as string))) {
      try {
        const getMetaFromMongo = async (mint: string) => {
          const landevoRes = await LandevoMetadata.findOne({
            mintAddress: mint,
          }).exec();
          const teslerrRes = await TeslerrMetadata.findOne({
            mintAddress: mint,
          }).exec();
          const treefiddyRes = await TreeFiddyMetadata.findOne({
            mintAddress: mint,
          }).exec();
          const gojiraRes = await GojiraMetadata.findOne({
            mintAddress: mint,
          }).exec();
          if (landevoRes) {
            return { ...landevoRes.metadata, mint: mint };
          }
          if (teslerrRes) {
            return { ...teslerrRes.metadata, mint: mint };
          }
          if (treefiddyRes) {
            return { ...treefiddyRes.metadata, mint: mint };
          }
          if (gojiraRes) {
            return { ...gojiraRes.metadata, mint: mint };
          }
          return null;
        };

        const tokenReq = await (
          await rpcConn.getParsedTokenAccountsByOwner(
            new PublicKey(wallet as string),
            { programId: TOKEN_PROGRAM_ID },
            "confirmed"
          )
        ).value;
        const tokenMetas = tokenReq
          .filter((v) => v.account.data.parsed.info.tokenAmount.amount > 0)
          .map((v) => v.account.data.parsed.info.mint);
        const result = [];
        for (const mintAdd of tokenMetas) {
          const metaRes = await getMetaFromMongo(mintAdd);
          if (metaRes) {
            result.push(metaRes);
          }
        }

        res.json(result);
      } catch (e) {
        console.log(e);
        res.status(500).send();
      }
    } else {
      res.status(400).send();
    }
  });
};
