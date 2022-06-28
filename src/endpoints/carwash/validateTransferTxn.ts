import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";

const locateTransferIx = (txn: ParsedTransactionWithMeta) => {
  type TransferCheckedIx = {
    parsed: {
      info: {
        authority: PublicKey;
        destination: PublicKey;
        mint: PublicKey;
        source: PublicKey;
        tokenAmount: {
          amount: string;
          decimals: number;
          uiAmount: number;
          uiAmountString: string;
        };
      };
      type: "transferChecked";
    };
    program: "spl-token";
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  };

  for (const ix of txn.transaction.message.instructions) {
    if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
      const unknownTypedIx = ix as unknown;
      return unknownTypedIx as TransferCheckedIx;
    }
  }
  return null;
};

/**
 * Validates a transferChecked Txn amount from provided source to dest. Returns `null` if transaction was not found or is invalid.
 */
export const validateTxnAmount = async (
  transaction: ParsedTransactionWithMeta,
  connection: Connection,
  transferAmount: number,
  destATAKey: PublicKey,
  srcATAKey: PublicKey,
  sendMint: PublicKey
) => {
  if (transaction) {
    const transferIx = locateTransferIx(transaction);
    if (transferIx) {
      const {
        parsed: {
          info: {
            destination,
            source,
            mint,
            tokenAmount: { uiAmount },
          },
        },
      } = transferIx;
      return (
        destination.equals(destATAKey) &&
        source.equals(srcATAKey) &&
        mint.equals(sendMint) &&
        uiAmount === transferAmount
      );
    }
  }
  return null;
};
