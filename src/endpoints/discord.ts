import DiscordOAuth from "discord-oauth2";
import express from "express";

import { currentKey } from "..";
import { whitelistSpots } from "../globals";
import { BWDiscordLink, getNumberInModel } from "../utils/mongo";

const router = express.Router();

//Check if discord link already exists
async function checkDiscordLink(discordId: string, wallet = null) {
  const ret: { exists: boolean; wallet?: string } = {
    exists: false,
    wallet: undefined,
  };
  let dataRes = await BWDiscordLink.findOne({ discordId: discordId }).exec();
  if (wallet && dataRes === null) {
    dataRes = await BWDiscordLink.findOne({ wallet: wallet }).exec();
  }
  if (dataRes) {
    ret["exists"] = true;
    ret["wallet"] = dataRes.wallet;
  }
  return ret;
}

router.get("/getlinks", async (req, res) => {
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

router.post("/manualdiscwalletlink", async (req, res) => {
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

router.get("/islinkedtodiscord", async (req, res) => {
  const { key, discordId } = req.query;
  if (key === currentKey) {
    res.json(await checkDiscordLink(discordId as string)).send();
  } else {
    res.status(401).send();
  }
});

router.get("/getlinkeddiscords", async (req, res) => {
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

router.post("/getIdFromCode", async (req, res) => {
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

router.post("/linkdiscord", async (req, res) => {
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
          await BWDiscordLink.create({ discordId: discordId, wallet: wallet });
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

router.post("/unlinkdiscord", async (req, res) => {
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

router.get("/walletbydiscord", async (req, res) => {
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

router.get("/discordbywallet", async (req, res) => {
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

router.get("/getstats", async (req, res) => {
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

export default router;
