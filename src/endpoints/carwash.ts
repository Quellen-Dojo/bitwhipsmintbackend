import { Router } from "express";

import { carwashCountDoc, IPFSClient, rpcConn } from "..";
import { generateCleanUploadAndUpdate } from "../utils/carwash/functions";
import { CarwashCount } from "../utils/mongo";
import { TxnTokenBalance } from "../utils/types";
import {
  fetchMetadataOfToken,
  retryGetTransaction,
  sendMessageToDiscord,
  sleep,
  validateTxnTransferAmounts,
} from "../utils/utils";

const router = Router();

router.get("/washedcars", async (req, res) => {
  try {
    const washedcars = (await CarwashCount.findOne({
      _id: carwashCountDoc,
    }).exec())!.amount;
    res.json({ amount: washedcars }).send();
  } catch {
    res.status(500).send();
  }
});
router.post("/processcarwash", async (req, res) => {
  const { signature, nft, fromWallet, type } = req.body;
  try {
    await sleep(2000);
    console.log(await rpcConn.confirmTransaction(signature, "confirmed"));
    const txn = await retryGetTransaction(signature);
    const tokenMeta = await fetchMetadataOfToken(nft.mint);
    if (!tokenMeta) {
      throw new Error(`Could not load metadata of ${nft.mint}`);
    }
    tokenMeta["mint"] = nft.mint;
    console.log(txn);
    const [from, to] = txn.transaction.message.accountKeys;
    console.log(`From: ${from.toBase58()}`);
    console.log(`To: ${to.toBase58()}`);
    const { postTokenBalances, preTokenBalances } = txn.meta!;
    // Full price 200000000
    // Debug price: 1000000
    if (
      validateTxnTransferAmounts(
        preTokenBalances as TxnTokenBalance,
        postTokenBalances as TxnTokenBalance,
        100 * 10 ** 9,
      ) &&
      // to.toBase58() === "H3WkH9HCWFP7jXN12RnJHZmis6ymv8yAx8jYQNTX4sHU" &&
      fromWallet === from.toBase58() &&
      !tokenMeta.attributes.some((attr) => attr.trait_type === "Washed")
    ) {
      //update metadata here!
      try {
        await generateCleanUploadAndUpdate(tokenMeta, type, IPFSClient);
        res.status(200).send();
      } catch (generationError) {
        console.log(generationError);
        sendMessageToDiscord(
          `<@&898643399299694622> <@&900148882489634836> **SERIOUS ERROR WITH THE CARWASH**\n\nTxn Signature: ${signature}\n\nMint Address: ${nft.mint}\n\nWe may have to refund this transaction!\n\n${generationError}`,
          "Car Wash Notifications",
        );
        res.status(500).send();
      }
    } else {
      res.status(304).send();
    }
  } catch (e) {
    console.log(e);
    sendMessageToDiscord(`ERROR WITH CAR WASH: ${e}\n\nSignature (if exists): ${signature}`, "Car Wash Notifications");
    res.status(500).send();
  }
});

export default router;
