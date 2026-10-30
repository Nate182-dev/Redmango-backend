const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Connection } = require("@solana/web3.js");

const app = express();
const PORT = process.env.PORT || 3000;

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const YOUR_WALLET = process.env.WALLET_ADDRESS || "79mKAmddMZ6RaEeop5w1WfD6tZaLBHybdgJQycJpRGiD";
const DATA_FILE = path.join(__dirname, "donations.json");

const connection = new Connection(RPC_URL, "confirmed");

app.use(cors());
app.use(express.json());

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return {
      totalRaised: 0.01,
      donations: []
    };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get("/api/total", (req, res) => {
  const data = readData();
  res.json({ total: data.totalRaised });
});

app.post("/api/verify-donation", async (req, res) => {
  try {
    const { amount, txHash } = req.body;

    if (!amount || !txHash) {
      return res.status(400).json({ error: "Missing amount or txHash" });
    }

    const donationAmount = Number(amount);
    if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta || tx.meta.err) {
      return res.status(400).json({ error: "Transaction not found or not confirmed" });
    }

    const accountKeys = tx.transaction.message.accountKeys || [];
    const postBalances = tx.meta.postBalances || [];
    const preBalances = tx.meta.preBalances || [];

    let received = 0;

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys[i]?.toString?.();

      if (!key || key !== YOUR_WALLET) continue;

      const diff = (postBalances[i] || 0) - (preBalances[i] || 0);
      if (diff > 0) {
        received += diff;
      }
    }

    if (received <= 0) {
      return res.status(400).json({ error: "No SOL transfer detected to your wallet" });
    }

    const sentSol = received / 1_000_000_000;

    if (sentSol < donationAmount) {
      return res.status(400).json({
        error: "Transaction amount is less than entered donation amount"
      });
    }

    const data = readData();
    data.totalRaised = Number((data.totalRaised + donationAmount).toFixed(2));
    data.donations.push({
      amount: donationAmount,
      txHash,
      timestamp: new Date().toISOString()
    });

    writeData(data);

    return res.json({
      success: true,
      total: data.totalRaised,
      msg: "Donation verified"
    });
  } catch (err) {
    console.error("verify-donation error:", err);
    return res.status(500).json({ error: "Server verification failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
