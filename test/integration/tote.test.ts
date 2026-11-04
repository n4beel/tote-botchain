import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Address,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TOTE_ABI } from "../../lib/botchain/abi";
import { readFileSync } from "fs";
import { resolve } from "path";

const ANVIL_PORT = 8655;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

// Anvil default accounts
const CREATOR_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Account 0
const JUDGE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";   // Account 1
const ALICE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";   // Account 2
const BOB_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";     // Account 3

const creatorAccount = privateKeyToAccount(CREATOR_KEY);
const judgeAccount = privateKeyToAccount(JUDGE_KEY);
const aliceAccount = privateKeyToAccount(ALICE_KEY);
const bobAccount = privateKeyToAccount(BOB_KEY);

describe("Tote integration test (Anvil)", () => {
  let anvilProcess: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  const creatorClient = createWalletClient({
    account: creatorAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const judgeClient = createWalletClient({
    account: judgeAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const aliceClient = createWalletClient({
    account: aliceAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const bobClient = createWalletClient({
    account: bobAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  beforeAll(async () => {
    anvilProcess = spawn("anvil", ["--port", String(ANVIL_PORT), "--silent"], {
      stdio: "ignore",
    });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        connected = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!connected) throw new Error("Could not connect to Anvil on port " + ANVIL_PORT);

    const artifactPath = resolve(__dirname, "../../contracts/out/Tote.sol/Tote.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const bytecode = artifact.bytecode.object as `0x${string}`;

    const deployHash = await creatorClient.deployContract({
      abi: TOTE_ABI,
      bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) throw new Error("Contract deployment failed");
    contractAddress = receipt.contractAddress;
  }, 20000);

  afterAll(() => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
  });

  it("completes full parimutuel lifecycle: open -> bets -> close -> judge decide -> claims -> withdraw", async () => {
    const question = "Which team wins the summer championship?";
    const options = ["Lions", "Tigers", "Eagles"];
    const judgeFeeBps = 400; // 4%
    const closeSecs = 3600n; // 1 hour
    const decideSecs = 86400n; // 1 day

    // 1. Open market
    const openHash = await creatorClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "open",
      args: [question, options, judgeAccount.address, judgeFeeBps, closeSecs, decideSecs],
    });
    await publicClient.waitForTransactionReceipt({ hash: openHash });

    // 2. Bets
    // Alice bets 2 BOT on Lions (opt 0)
    const betAlice = await aliceClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "bet",
      args: [1n, 0],
      value: parseEther("2"),
    });
    await publicClient.waitForTransactionReceipt({ hash: betAlice });

    // Bob bets 3 BOT on Tigers (opt 1)
    const betBob = await bobClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "bet",
      args: [1n, 1],
      value: parseEther("3"),
    });
    await publicClient.waitForTransactionReceipt({ hash: betBob });

    // Verify totals
    const totals = (await publicClient.readContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "totals",
      args: [1n],
    })) as readonly bigint[];
    expect(totals[0]).toBe(parseEther("2"));
    expect(totals[1]).toBe(parseEther("3"));
    expect(totals[2]).toBe(0n);

    // 3. Advance time past closeSecs into decision window
    await (publicClient.request as any)({
      method: "evm_increaseTime",
      params: [3700],
    });
    await (publicClient.request as any)({
      method: "evm_mine",
      params: [],
    });

    // 4. Judge calls Lions (opt 0) as winner
    const decideHash = await judgeClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "decide",
      args: [1n, 0],
    });
    await publicClient.waitForTransactionReceipt({ hash: decideHash });

    // Total pot: 5 BOT.
    // 4% fee = 0.2 BOT to judge.
    // Pool = 4.8 BOT.
    const judgePending = await publicClient.readContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "pending",
      args: [judgeAccount.address],
    });
    expect(judgePending).toBe(parseEther("0.2"));

    // 5. Alice claims her winning payout
    // Alice staked 2 BOT out of 2 BOT on Lions -> receives entire 4.8 BOT pool
    const aliceQuote = await publicClient.readContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "quoteClaim",
      args: [1n, aliceAccount.address],
    });
    expect(aliceQuote).toBe(parseEther("4.8"));

    const claimHash = await aliceClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "claim",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: claimHash });

    const alicePending = await publicClient.readContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "pending",
      args: [aliceAccount.address],
    });
    expect(alicePending).toBe(parseEther("4.8"));

    // 6. Withdrawals
    const judgeBalBefore = await publicClient.getBalance({ address: judgeAccount.address });
    const jWithdrawHash = await judgeClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "withdraw",
    });
    const jReceipt = await publicClient.waitForTransactionReceipt({ hash: jWithdrawHash });
    const jGas = jReceipt.gasUsed * jReceipt.effectiveGasPrice;
    const judgeBalAfter = await publicClient.getBalance({ address: judgeAccount.address });
    expect(judgeBalAfter).toBe(judgeBalBefore + parseEther("0.2") - jGas);

    const aliceBalBefore = await publicClient.getBalance({ address: aliceAccount.address });
    const aWithdrawHash = await aliceClient.writeContract({
      address: contractAddress,
      abi: TOTE_ABI,
      functionName: "withdraw",
    });
    const aReceipt = await publicClient.waitForTransactionReceipt({ hash: aWithdrawHash });
    const aGas = aReceipt.gasUsed * aReceipt.effectiveGasPrice;
    const aliceBalAfter = await publicClient.getBalance({ address: aliceAccount.address });
    expect(aliceBalAfter).toBe(aliceBalBefore + parseEther("4.8") - aGas);
  });
});
