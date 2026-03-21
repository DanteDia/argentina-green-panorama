// Server-only GenLayer client for Next.js API routes
// Never import this file from client components

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";

/** Extract JSON from a string that may contain markdown code blocks or preamble */
function parseContractResult(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return raw as Record<string, unknown>;
  const s = raw.trim();
  // Try direct parse
  try { return JSON.parse(s); } catch { /* continue */ }
  // Try extracting from ```json ... ```
  const mdMatch = s.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (mdMatch) try { return JSON.parse(mdMatch[1]); } catch { /* continue */ }
  // Try first { ... } block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* continue */ }
  }
  return { error: "could_not_parse", raw: s.slice(0, 200) };
}

// Contract deployed on GenLayer Studio (studionet)
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT ||
  "0xb81f386D893cda2016bfAeC6FF9B2027CD35413d") as Address;

// Studionet is a simulator — no gas fees, auto-funded accounts
// No private key needed
let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    const account = createAccount(); // generates fresh funded account on studionet
    _client = createClient({
      chain: studionet,
      account,
    });
  }
  return _client;
}

export function getContractAddress(): Address {
  return CONTRACT_ADDRESS;
}

export async function verifyNode(
  nodeId: string,
  nombre: string,
  link: string,
  cluster: string,
  categoria: string,
  descripcion: string,
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_node",
    args: [nodeId, nombre, link || "", cluster || "", categoria || "", descripcion || ""],
    value: 0n,
  });
  return hash;
}

export async function verifySocial(
  nodeId: string,
  nombre: string,
  socialLinks: string[],
  claimedFollowers: Record<string, number>,
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_social",
    args: [
      nodeId,
      nombre,
      JSON.stringify(socialLinks),
      JSON.stringify(claimedFollowers),
    ],
    value: 0n,
  });
  return hash;
}

export async function verifyRelationship(
  edgeId: string,
  nodeAName: string,
  nodeALink: string,
  nodeBName: string,
  nodeBLink: string,
  relationshipType: string,
  relationshipDescription: string,
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_relationship",
    args: [edgeId, nodeAName, nodeALink || "", nodeBName, nodeBLink || "", relationshipType || "", relationshipDescription || ""],
    value: 0n,
  });
  return hash;
}

// GenLayer SDK returns numeric status codes — normalize to strings
const STATUS_MAP: Record<number, string> = {
  0: "UNINITIALIZED", 1: "PENDING", 2: "PROPOSING",
  3: "COMMITTING", 4: "REVEALING", 5: "ACCEPTED",
  6: "UNDETERMINED", 7: "FINALIZED", 8: "CANCELED",
};

function normalizeStatus(status: unknown): string {
  if (typeof status === "number") return STATUS_MAP[status] || String(status);
  if (typeof status === "string") return status;
  return "UNKNOWN";
}

export async function getTransactionStatus(txHash: string) {
  const client = getClient();
  try {
    const tx = await client.getTransaction({
      hash: txHash as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    const status = normalizeStatus(tx.status ?? tx.statusName);

    // Try to extract leader result from the raw transaction data
    // The SDK type doesn't expose consensus_data but the RPC response has it
    const rawTx = tx as Record<string, unknown>;
    const consensusData = rawTx.consensus_data as Record<string, unknown> | undefined;
    let leaderResult: Record<string, unknown> | null = null;

    if (consensusData?.leader_receipt) {
      const receipts = consensusData.leader_receipt as Array<Record<string, unknown>>;
      if (receipts[0]) {
        const result = receipts[0].result as Record<string, unknown> | undefined;
        if (result?.status === "success" && result?.payload) {
          try {
            // payload may be base64 encoded or raw string
            const payload = String(result.payload);
            const decoded = payload.startsWith("ey") ? atob(payload) : payload;
            leaderResult = parseContractResult(decoded) as Record<string, unknown>;
          } catch { /* ignore parse errors */ }
        }
      }
    }

    return { status, data: tx, leaderResult };
  } catch {
    return { status: "PENDING", data: null, leaderResult: null };
  }
}

export async function getVerification(nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_verification",
    args: [nodeId],
  });
  return parseContractResult(result);
}

export async function getSocialVerification(nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_social_verification",
    args: [nodeId],
  });
  return parseContractResult(result);
}

export async function getRelationshipVerification(edgeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_relationship_verification",
    args: [edgeId],
  });
  return parseContractResult(result);
}

export async function getContractStats() {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_stats",
    args: [],
  });
  return parseContractResult(result);
}
