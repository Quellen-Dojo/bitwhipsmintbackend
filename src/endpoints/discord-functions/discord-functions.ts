import { Express } from "express";
import DiscordOAuth from "discord-oauth2";
import { whitelistSpots } from "../..";
import {
  BWDiscordLink,
  BWHolderLink,
  getNumberInModel,
} from "../../utils/mongo";
import { DiamondVaultAPIResponse } from "../../utils/types";
import { postRequest } from "../../utils/utils";
import {
  checkDiscordLink,
  getNumOfBitWhipsRecheck,
  sendHolderMessageToDiscord,
  verifySignature,
} from "./utils";

export const registerDiscordEnpoints = (app: Express) => {
  require("dotenv").config();
  const currentKey = process.env.accessKey;
  app.get("/holderstatus", async (req, res) => {
    const { wallet, signature } = req.query;
    if (
      wallet &&
      signature &&
      verifySignature(
        "I AM MY BITWHIP AND MY BITWHIP IS ME!",
        wallet as string,
        signature as string
      )
    ) {
      res.json({
        valid: !!(await BWHolderLink.findOne({ wallet: wallet }).exec()),
      });
    } else {
      res.json({ valid: false });
    }
  });

  app.get("/holderdiscordcheck", async (req, res) => {
    try {
      const oauth2 = new DiscordOAuth();

      const { code } = req.query;

      console.log(code);

      if (code) {
        const tokenRes = await oauth2.tokenRequest({
          clientId: "940761522781683793",
          redirectUri: process.env.toolVerifRedirect,
          clientSecret: process.env.holderVerifSecret,
          code: code as string,
          grantType: "authorization_code",
          scope: "identify",
        });
        const accessToken = tokenRes.access_token;
        const user = await oauth2.getUser(accessToken);
        const userId = user.id;
        if (await BWDiscordLink.findOne({ discordId: userId }).exec()) {
          res.json({ valid: true });
        } else {
          res.json({ valid: false });
        }

        res.status(500).send();
      } else {
        res.status(500).send();
      }
    } catch (e) {
      console.log(e);
      res.status(500).send();
    }
  });

  app.get("/dolphinstatus", async (req, res) => {
    const { wallet, signature } = req.query;
    if (
      wallet &&
      signature &&
      verifySignature(
        "I AM MY BITWHIP AND MY BITWHIP IS ME!",
        wallet as string,
        signature as string
      ) &&
      (await getNumOfBitWhipsRecheck(wallet as string)) >= 5
    ) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false });
    }
  });

  app.post("/recheckHolders", async (req, res) => {
    const { key } = req.body;
    if (key === currentKey) {
      const validRes: { [discordId: string]: number } = {};
      const invalidRes: string[] = [];
      let staked: DiamondVaultAPIResponse | undefined;
      try {
        staked = await postRequest(
          "https://us-central1-nft-anybodies.cloudfunctions.net/API_V2_GetVaultStakerData",
          { data: { vaultId: process.env.stakedVaultId } }
        );
      } catch {}

      const holderDocs = await BWHolderLink.find({}).exec();
      for (const doc of holderDocs) {
        let holdingNum = await getNumOfBitWhipsRecheck(doc.wallet!);
        if (staked) {
          const stakedEntry = staked.filter((v) => v["_id"] === doc.wallet);
          if (stakedEntry.length > 0) {
            holdingNum += stakedEntry[0]["Tokens"].length;
          }
        }
        if (holdingNum > 0) {
          validRes[doc.discordId!] = holdingNum;
        } else {
          invalidRes.push(doc.discordId!);
          await BWHolderLink.deleteMany({ wallet: doc.wallet }).exec();
        }
      }
      res.json({ valid: validRes, invalid: invalidRes });
    } else {
      res.status(401);
    }
  });

  app.post("/submitForHolderVerif", async (req, res) => {
    const { discordId, wallet, signature } = req.body;
    const jsonRes: { error: boolean; success: boolean } = {
      error: false,
      success: false,
    };
    console.log(`Holder Verif: ${discordId} ${wallet} ${signature}`);
    if (
      discordId &&
      wallet &&
      verifySignature(
        "I AM MY BITWHIP AND MY BITWHIP IS ME!",
        wallet,
        signature
      )
    ) {
      try {
        const walletCheckRes = await BWHolderLink.findOne({
          discordId: discordId,
        }).exec();
        if (walletCheckRes) {
          await BWHolderLink.updateMany(
            { discordId: discordId },
            { discordId: discordId, wallet: wallet }
          ).exec();
        } else {
          await BWHolderLink.create({ discordId: discordId, wallet: wallet });
          let staked: DiamondVaultAPIResponse | undefined;
          try {
            staked = await postRequest(
              "https://us-central1-nft-anybodies.cloudfunctions.net/API_V2_GetVaultStakerData",
              { data: { vaultId: process.env.stakedVaultId } }
            );
          } catch {}
          let holdingNum = await getNumOfBitWhipsRecheck(wallet);
          if (staked) {
            const stakedEntry = staked.filter((v) => v["_id"] === wallet);
            if (stakedEntry.length > 0) {
              holdingNum += stakedEntry[0]["Tokens"].length;
            }
          }
          if (holdingNum > 0) {
            // Submit Request to update roles.
            sendHolderMessageToDiscord(
              `${discordId} ${wallet} ${signature} ${holdingNum}`,
              "Holder Verification"
            );
          }
        }
        jsonRes.success = true;
      } catch (e) {
        console.log(e);
        jsonRes.error = true;
      }
      res.json(jsonRes);
    } else {
      res.status(400);
    }
  });

  app.get("/getlinks", async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
      BWDiscordLink.find((err, doc) => {
        if (err) {
          res.status(500).send();
        } else {
          res.json(doc.map((v) => v.wallet)).send();
          res.status(200).send();
        }
      });
    } else {
      res.status(401).send();
    }
  });

  app.post("/manualdiscwalletlink", async (req, res) => {
    const { key, discordId, wallet } = req.body;
    if (key === currentKey) {
      try {
        const existingDiscEntry = await BWDiscordLink.findOne({
          discordId: discordId,
        }).exec();
        const existingWalletEntry = await BWDiscordLink.findOne({
          wallet: wallet,
        }).exec();
        if (!existingDiscEntry && !existingWalletEntry) {
          await BWDiscordLink.create({
            discordId: discordId.toString(),
            wallet: wallet,
          });
          res.status(200).send();
        } else {
          res.status(409).send();
        }
      } catch {
        res.status(500).send();
      }
    } else {
      res.status(403).send();
    }
  });

  app.get("/islinkedtodiscord", async (req, res) => {
    const { key, discordId } = req.query;
    if (key === currentKey) {
      res.json(await checkDiscordLink(discordId as string)).send();
    } else {
      res.status(401).send();
    }
  });

  app.get("/getlinkeddiscords", async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
      BWDiscordLink.find((err, doc) => {
        if (err) {
          res.status(500).send();
        } else {
          res.json(doc.map((v) => v.discordId)).send();
        }
      });
    } else {
      res.status(401).send();
    }
  });

  app.post("/getIdFromCode", async (req, res) => {
    try {
      const oauth2 = new DiscordOAuth({
        clientId: "940761522781683793",
        clientSecret: process.env.holderVerifSecret,
        redirectUri: process.env.holderVerifRedirect,
        requestTimeout: 10000,
      });

      const { code } = req.body;

      if (code) {
        const tokenRes = await oauth2.tokenRequest({
          code: code,
          grantType: "authorization_code",
          scope: "identify",
        });
        const accessToken = tokenRes.access_token;
        const user = await oauth2.getUser(accessToken);

        res
          .json({
            discordId: user.id,
            username: `${user.username}#${user.discriminator}`,
          })
          .send();
      } else {
        res.status(400).send();
      }
    } catch (e) {
      res.status(500).send();
    }
  });

  app.post("/linkdiscord", async (req, res) => {
    const { discordId, wallet, key } = req.body;
    try {
      if (key === currentKey) {
        const checkRes = await checkDiscordLink(discordId, wallet);
        const whitelistedNum = await getNumberInModel(BWDiscordLink);
        const jsonRes: {
          exists: boolean;
          wallet?: string;
          created: boolean;
          closed: boolean;
        } = {
          exists: false,
          wallet: undefined,
          created: false,
          closed: false,
        };
        if (whitelistedNum < whitelistSpots) {
          if (checkRes.exists) {
            jsonRes["exists"] = true;
            jsonRes["wallet"] = checkRes["wallet"];
            res.json(jsonRes).send();
          } else {
            await BWDiscordLink.create({
              discordId: discordId,
              wallet: wallet,
            });
            jsonRes["wallet"] = wallet;
            jsonRes["created"] = true;
            res.json(jsonRes).send();
          }
        } else {
          jsonRes["closed"] = true;
          res.json(jsonRes).send();
        }
      } else {
        res.status(401).send();
      }
    } catch {
      res.status(500).send();
    }
  });

  app.post("/unlinkdiscord", async (req, res) => {
    const { key, discordId } = req.body;
    if (key === currentKey && discordId) {
      const dataRes = await BWDiscordLink.findOne({
        discordId: discordId,
      }).exec();
      if (dataRes) {
        await BWDiscordLink.deleteMany({ discordId: discordId }).exec();
        res.status(200).send();
      } else {
        res.status(404).send();
      }
    } else {
      res.status(401).send();
    }
  });

  app.get("/walletbydiscord", async (req, res) => {
    const { key, id } = req.query;
    if (key === currentKey) {
      const wRes = await BWDiscordLink.findOne({ discordId: id }).exec();
      if (wRes) {
        res.json({ wallet: wRes.wallet }).send();
      } else {
        res.status(404).send();
      }
    } else {
      res.status(401).send();
    }
  });

  app.get("/discordbywallet", async (req, res) => {
    const { key, wallet } = req.query;
    if (key === currentKey) {
      const thing = await BWDiscordLink.findOne({ wallet }).exec();
      if (thing) {
        res.json({ wallet: thing.discordId });
      } else {
        res.json({ wallet: null });
      }
    } else {
      res.status(401).send();
    }
  });

  app.get("/getstats", async (req, res) => {
    const { key } = req.query;
    if (key === currentKey) {
      try {
        const numWhitelists = await getNumberInModel(BWDiscordLink);
        const numAirdrops = await getNumberInModel(BWDiscordLink);
        res.json({ whitelists: numWhitelists, airdrops: numAirdrops }).send();
      } catch (e) {
        res.status(500).send();
      }
    } else {
      res.status(401).send();
    }
  });
};
