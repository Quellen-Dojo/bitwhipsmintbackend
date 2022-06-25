export type CarType = "landevo" | "teslerr" | "treefiddy" | "gojira";

export type NFTMetadata = {
  name: string;
  symbol: string;
  description: string;
  seller_fee_basis_points: number;
  image: string;
  edition?: number;
  external_url: string;
  attributes: { trait_type: string; value: string }[];
  collection: { name: string; family: string };
  properties: {
    files: { uri: string; type: string }[];
    category: string;
    creators: { address: string; share: number }[];
  };
  mint?: string;
};

export type DiamondVaultAPIResponse = {
  _id: string;
  Tokens: string[];
}[];
