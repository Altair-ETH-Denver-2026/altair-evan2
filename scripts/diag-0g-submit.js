#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Captures chain/indexer/node context and attempts one 0G flow.submit (upload).
 * Use to debug flow.submit reverts and upload failures.
 *
 * Run from repo root after `npm install` (so patch-0g-sdk has been applied):
 *   node scripts/diag-0g-submit.js
 *   npm run diag:0g-submit
 *
 * Requires .env (or env) with ZG_PRIVATE_KEY, and optionally ZG_RPC_URL, ZG_INDEXER_RPC.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

const repoRoot = path.join(__dirname, '..');
loadEnv(path.join(repoRoot, '.env'));
loadEnv(path.join(repoRoot, '.env.local'));

const ZG_RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY;

function log(label, data) {
  console.log('\n---', label, '---');
  if (typeof data === 'object' && data !== null) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

async function main() {
  console.log('diag-0g-submit: gathering context and attempting one upload.\n');

  if (!ZG_PRIVATE_KEY) {
    console.error('Missing ZG_PRIVATE_KEY. Set it in .env or the environment.');
    process.exit(1);
  }

  const { ethers } = require('ethers');
  const { Indexer, ZgFile } = require('@0glabs/0g-ts-sdk');

  const provider = new ethers.JsonRpcProvider(ZG_RPC_URL);
  const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);

  const context = {
    ZG_RPC_URL,
    ZG_INDEXER_RPC,
    signerAddress: null,
    signerBalanceWei: null,
    signerBalance0g: null,
    chainId: null,
    indexerNodes: null,
    nodeSelectionError: null,
    firstNodeStatus: null,
  };

  try {
    context.signerAddress = await signer.getAddress();
    const balanceWei = await provider.getBalance(context.signerAddress);
    context.signerBalanceWei = balanceWei.toString();
    context.signerBalance0g = ethers.formatEther(balanceWei);

    const network = await provider.getNetwork();
    context.chainId = Number(network.chainId);

    log('Chain & signer', {
      chainId: context.chainId,
      signerAddress: context.signerAddress,
      signerBalance0g: context.signerBalance0g,
      signerBalanceWei: context.signerBalanceWei,
    });

    const indexer = new Indexer(ZG_INDEXER_RPC);
    const [nodes, nodesErr] = await indexer.selectNodes(1);
    context.nodeSelectionError = nodesErr ? String(nodesErr) : null;
    context.indexerNodes = nodes ? nodes.map((n) => n.url) : [];

    const firstNode = nodes?.[0];
    if (firstNode) {
      try {
        context.firstNodeStatus = await firstNode.getStatus();
      } catch (e) {
        context.firstNodeStatus = { error: String(e) };
      }
    }

    log('Indexer', {
      indexerRpc: ZG_INDEXER_RPC,
      selectedNodes: context.indexerNodes,
      nodeSelectionError: context.nodeSelectionError,
      firstNodeStatus: context.firstNodeStatus,
    });

    const tmpFile = path.join(os.tmpdir(), `diag-0g-submit-${Date.now()}.json`);
    const payload = JSON.stringify({
      diag: true,
      ts: new Date().toISOString(),
      message: 'diagnostic upload from diag-0g-submit.js',
    });
    fs.writeFileSync(tmpFile, payload, 'utf8');

    log('Upload attempt', { tmpFile, payloadLength: payload.length });

    const file = await ZgFile.fromFilePath(tmpFile);
    try {
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr !== null || !tree) {
        throw new Error(`Merkle tree error: ${String(treeErr)}`);
      }
      const rootHash = tree.rootHash();
      if (!rootHash) throw new Error('No root hash');

      const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer);
      if (uploadErr !== null) {
        throw new Error(`Upload error: ${String(uploadErr)}`);
      }

      const txHash = typeof tx === 'string' ? tx : (tx && (tx.hash ?? tx.txHash ?? tx.transactionHash)) || null;
      log('Upload result', { ok: true, rootHash, txHash });
    } finally {
      await file.close().catch(() => {});
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}
    }
  } catch (err) {
    log('Error', {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
    log('Full context', context);
    process.exit(1);
  }
}

main();
