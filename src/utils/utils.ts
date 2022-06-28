import { Connection, PublicKey } from "@solana/web3.js";
import { programs } from "@metaplex/js";
import { https } from "follow-redirects";
const {
  metadata: { Metadata },
} = programs;

export const fetchMetadataOfToken = async (
  mintAddress: string,
  connection: Connection
) => {
  const topLevel = await Metadata.load(
    connection,
    await Metadata.getPDA(new PublicKey(mintAddress))
  );
  return await redirectThroughArweave(topLevel.data.data.uri);
};

export const redirectThroughArweave = (url: string) => {
  return new Promise<any | null>((resolve, reject) => {
    https.get(
      url,
      { headers: { "Content-Type": "application/json" } },
      (res) => {
        try {
          let data = "";
          res.on("data", (d) => (data += d.toString()));
          res.on("error", () => reject(null));
          res.on("end", () => {
            const resolved = JSON.parse(data);
            resolve(resolved);
          });
        } catch {
          reject(null);
        }
      }
    );
  });
};

export const postRequest = (url: string, payload: object): Promise<any> => {
  return new Promise((resolve, reject) => {
    const arReq = https.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        try {
          let data = "";
          res.on("data", (d) => (data += d.toString()));
          res.on("error", () => reject());
          res.on("end", () => {
            resolve(JSON.parse(data));
          });
        } catch (e) {
          console.log(e);
          reject();
        }
      }
    );
    arReq.write(JSON.stringify(payload));
    arReq.end();
  });
};

export const sendMessageToDiscord = (
  message: string,
  username: string,
  avatarImageUrl = ""
) => {
  const discordMsg = https.request(process.env.discordWebhook!, {
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

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
