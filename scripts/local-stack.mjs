#!/usr/bin/env node
import { spawn } from "child_process";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const PORT = 8755;
const RPC_URL = `http://127.0.0.1:${PORT}`;

// 10 default anvil accounts
const PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Creator
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Judge
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Bettor A
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Bettor B
  "0x47e179ec197488593b100287e941669c6bf3605b514b4aeeb33a498f8b3384b8", // 4: Bettor C
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // 5: Bettor D
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d4b9a8e63da35828d0", // 6: Bettor E
  "0x4bbbf856042410b379d278eee7408a0db70ac6a050d0d53043d347285d422b61", // 7: Outsider
];

async function main() {
  console.log(`Starting Anvil on port ${PORT}...`);
  const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], {
    stdio: "inherit",
  });

  process.on("SIGINT", () => {
    anvil.kill();
    process.exit();
  });
  process.on("SIGTERM", () => {
    anvil.kill();
    process.exit();
  });

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  for (let i = 0; i < 40; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const accounts = PRIVATE_KEYS.map((pk) => privateKeyToAccount(pk as `0x${string}`));
  const clients = accounts.map((account) =>
    createWalletClient({
      account,
      transport: http(RPC_URL),
    })
  );

  // Deploy contract
  const artifactPath = resolve(process.cwd(), "contracts/out/Tote.sol/Tote.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.bytecode.object as `0x${string}`;
  const abi = artifact.abi;

  const deployHash = await clients[0].deployContract({
    abi,
    bytecode,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = receipt.contractAddress as Address;

  console.log(`Tote deployed at: ${contractAddress}`);

  const envContent = [
    `NEXT_PUBLIC_CONTRACT_31337=${contractAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_31337=1`,
    `NEXT_PUBLIC_RPC_URL_31337=${RPC_URL}`,
    "",
  ].join("\n");
  writeFileSync(resolve(process.cwd(), ".env.local"), envContent);
  console.log("Updated .env.local with local stack contract address");

  // Seed markets matching Spec §5:
  // 1: open with bets on three outcomes
  // 2: closing in ~10 minutes
  // 3: closed, waiting for the judge
  // 4: decided (winners with pending claims, one already claimed)
  // 5: void (no backers on the called outcome)
  // 6: void (judge silent)
  // 7: market with a judge fee of 3%

  // Market 1: Open with bets on 3 outcomes
  const tx1 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Who wins the Euro Finals?", ["Spain", "England", "France"], accounts[1].address, 200, 86400 * 3, 86400 * 2],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx1 });

  await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [1n, 0],
    value: parseEther("1.5"),
  });
  await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [1n, 1],
    value: parseEther("2.0"),
  });
  await clients[4].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [1n, 2],
    value: parseEther("0.8"),
  });

  // Market 2: Closing in ~10 minutes (we set closeSecs to 1 hour, won't advance past)
  const tx2 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Bake-Off: Best Sourdough Loaf", ["Alice", "Bob", "Charlie"], accounts[1].address, 100, 3600, 86400],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx2 });
  await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [2n, 0],
    value: parseEther("0.5"),
  });

  // Market 3: Closed, waiting for judge (we will mine past closeSecs)
  const tx3 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["City Marathon: Will sub-2hr be broken?", ["Yes", "No"], accounts[1].address, 150, 3600, 86400],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx3 });
  await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [3n, 1],
    value: parseEther("3.0"),
  });

  // Market 4: Decided (Alice and Bob win, Alice claims, Bob pending)
  const tx4 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Weekend Derby Winner", ["Stallion", "Thunder", "Blaze"], accounts[1].address, 200, 3600, 86400],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx4 });
  await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [4n, 0],
    value: parseEther("1.0"),
  });
  await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [4n, 0],
    value: parseEther("2.0"),
  });
  await clients[4].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [4n, 1],
    value: parseEther("1.5"),
  });

  // Market 5: Void (No backers on the called outcome)
  const tx5 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["First rover to land on Europa", ["SpaceX", "NASA", "CNSA"], accounts[1].address, 0, 3600, 86400],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx5 });
  await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [5n, 0],
    value: parseEther("1.0"),
  });

  // Market 6: Void (Judge silent)
  const tx6 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Local Election Mayor", ["Candidate A", "Candidate B"], accounts[1].address, 0, 3600, 86400],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx6 });
  await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [6n, 0],
    value: parseEther("2.0"),
  });

  // Market 7: Judge fee of 3%
  const tx7 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Tournament Chess Master", ["Grandmaster A", "Grandmaster B"], accounts[1].address, 300, 86400 * 7, 86400 * 3],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx7 });
  await clients[4].writeContract({
    address: contractAddress,
    abi,
    functionName: "bet",
    args: [7n, 0],
    value: parseEther("4.0"),
  });

  // Advance time past 3600 seconds to close markets 2, 3, 4, 5, 6
  await publicClient.request({
    // @ts-expect-error Anvil RPC
    method: "evm_increaseTime",
    params: [3700],
  });
  await publicClient.request({
    // @ts-expect-error Anvil RPC
    method: "evm_mine",
    params: [],
  });

  // Decide Market 4 (option 0 Stallion wins)
  const d4 = await clients[1].writeContract({
    address: contractAddress,
    abi,
    functionName: "decide",
    args: [4n, 0],
  });
  await publicClient.waitForTransactionReceipt({ hash: d4 });
  // Bettor A (clients[2]) claims
  const c4 = await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "claim",
    args: [4n],
  });
  await publicClient.waitForTransactionReceipt({ hash: c4 });

  // Decide Market 5 (option 2 CNSA called, which had 0 bets -> voids!)
  const d5 = await clients[1].writeContract({
    address: contractAddress,
    abi,
    functionName: "decide",
    args: [5n, 2],
  });
  await publicClient.waitForTransactionReceipt({ hash: d5 });

  // Expire Market 6 (advance past decideBy: 3700 + 86400)
  await publicClient.request({
    // @ts-expect-error Anvil RPC
    method: "evm_increaseTime",
    params: [86500],
  });
  await publicClient.request({
    // @ts-expect-error Anvil RPC
    method: "evm_mine",
    params: [],
  });
  const exp6 = await clients[7].writeContract({
    address: contractAddress,
    abi,
    functionName: "expire",
    args: [6n],
  });
  await publicClient.waitForTransactionReceipt({ hash: exp6 });

  console.log("Seeding complete! 7 parimutuel markets seeded with varied states.");
  console.log("Local stack ready at http://localhost:3000 (running against port 8755)");
}

main().catch(console.error);
