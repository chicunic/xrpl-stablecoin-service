import { getClient } from "@token/services/xrpl.service.js";
import { Wallet } from "xrpl";

export async function fundAccount(address: string): Promise<{ balance: number }> {
  const client = await getClient();
  const wallet = new Wallet("", "", { masterAddress: address });
  const result = await client.fundWallet(wallet);
  return { balance: result.balance };
}
