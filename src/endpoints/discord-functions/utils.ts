import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { https } from "follow-redirects";
import tweetnacl from "tweetnacl";
import { rpcConn } from "../..";
import {
  LandevoMetadata,
  TeslerrMetadata,
  TreeFiddyMetadata,
  GojiraMetadata,
  BWDiscordLink,
} from "../../utils/mongo";

export const verifySignature = (
  msg: string,
  pubKey: string,
  signature: string
) => {
  return tweetnacl.sign.detached.verify(
    new TextEncoder().encode(msg),
    bs58.decode(signature),
    bs58.decode(pubKey)
  );
};

export const getNumOfBitWhipsRecheck = async (wallet: string) => {
  const accs = (
    await rpcConn.getParsedTokenAccountsByOwner(new PublicKey(wallet), {
      programId: TOKEN_PROGRAM_ID,
    })
  ).value;
  const tokenMints: string[] = accs
    .filter((v) => v.account.data.parsed.info.tokenAmount.amount > 0)
    .map((v) => v.account.data.parsed.info.mint);

  return (
    (await LandevoMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await TeslerrMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await TreeFiddyMetadata.find({ mintAddress: tokenMints }).exec()).length +
    (await GojiraMetadata.find({ mintAddress: tokenMints }).exec()).length
  );
};

//Check if discord link already exists
export const checkDiscordLink = async (discordId: string, wallet = null) => {
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
};

export const sendHolderMessageToDiscord = (
  message: string,
  username: string,
  avatarImageUrl = ""
) => {
  const discordMsg = https.request(process.env.holderWebhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  discordMsg.write(
    JSON.stringify({
      username: username,
      avatar_url: avatarImageUrl,
      content: message,
    })
  );
  discordMsg.end();
};
