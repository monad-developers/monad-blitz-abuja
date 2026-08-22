/**
 * Generate throwaway burner wallets for load testing.
 * Outputs a JSON file with private keys and addresses.
 *
 * Usage:
 *   npx tsx src/generateWallets.ts [count]
 *   # or from monorepo root:
 *   npm run generate:wallets
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const count = parseInt(process.argv[2] || "150", 10);
const outputPath = resolve(__dirname, "..", "..", "wallets.json");

interface Wallet {
  index: number;
  privateKey: string;
  address: string;
}

console.log(`🔑 Generating ${count} burner wallets...`);

const wallets: Wallet[] = [];

for (let i = 0; i < count; i++) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  wallets.push({
    index: i,
    privateKey,
    address: account.address,
  });
}

writeFileSync(outputPath, JSON.stringify(wallets, null, 2));

console.log(`✅ Generated ${count} wallets → ${outputPath}`);
console.log(`   First:  ${wallets[0].address}`);
console.log(`   Last:   ${wallets[count - 1].address}`);
console.log("");
console.log(
  "⚠️  wallets.json contains private keys — it's in .gitignore, don't commit it."
);
