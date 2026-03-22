// Server-only GenLayer client for Next.js API routes
// Never import this file from client components

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";

/** Default map ID for the green panorama prototype */
export const DEFAULT_MAP_ID = "green-argentina";

/** Extract JSON from a string that may contain markdown code blocks or preamble */
function parseContractResult(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return raw as Record<string, unknown>;
  const s = raw.trim();
  try { return JSON.parse(s); } catch { /* continue */ }
  const mdMatch = s.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (mdMatch) try { return JSON.parse(mdMatch[1]); } catch { /* continue */ }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* continue */ }
  }
  return { error: "could_not_parse", raw: s.slice(0, 200) };
}

// VerifiableIndustries contract on GenLayer Studio (studionet)
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT ||
  "0xd410384E9039F0AC48996eF0da29dE602dee1aCc") as Address;

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    const account = createAccount();
    _client = createClient({ chain: studionet, account });
  }
  return _client;
}

export function getContractAddress(): Address {
  return CONTRACT_ADDRESS;
}

export async function verifyNode(
  mapId: string,
  nodeId: string,
  nombre: string,
  link: string,
  sector: string,
  categoria: string,
  descripcion: string,
  country: string,
  claimedFunding: string = "",
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_node",
    args: [mapId, nodeId, nombre, link || "", sector || "", categoria || "", descripcion || "", country || "", claimedFunding || ""],
    value: 0n,
  });
  return hash;
}

export async function verifySocial(
  mapId: string,
  nodeId: string,
  nombre: string,
  socialLinks: string[],
  claimedFollowers: Record<string, number>,
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_social",
    args: [mapId, nodeId, nombre, JSON.stringify(socialLinks), JSON.stringify(claimedFollowers)],
    value: 0n,
  });
  return hash;
}

export async function verifyRelationship(
  mapId: string,
  edgeId: string,
  nodeAName: string,
  nodeALink: string,
  nodeBName: string,
  nodeBLink: string,
  relationshipType: string,
  relationshipDescription: string,
  sector: string,
  country: string,
): Promise<string> {
  const client = getClient();
  const hash = await client.writeContract({
    address: getContractAddress(),
    functionName: "verify_relationship",
    args: [mapId, edgeId, nodeAName, nodeALink || "", nodeBName, nodeBLink || "", relationshipType || "", relationshipDescription || "", sector || "", country || ""],
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
    const rawTx = tx as Record<string, unknown>;
    const consensusData = rawTx.consensus_data as Record<string, unknown> | undefined;
    let leaderResult: Record<string, unknown> | null = null;

    if (consensusData?.leader_receipt) {
      const receipts = consensusData.leader_receipt as Array<Record<string, unknown>>;
      if (receipts[0]) {
        const result = receipts[0].result as Record<string, unknown> | undefined;
        if (result && (result.status === "return" || result.status === "success") && result.payload != null) {
          try {
            const payload = result.payload;
            if (typeof payload === "object" && payload !== null) {
              leaderResult = payload as Record<string, unknown>;
            } else {
              const payloadStr = String(payload);
              const decoded = payloadStr.startsWith("ey") ? atob(payloadStr) : payloadStr;
              leaderResult = parseContractResult(decoded) as Record<string, unknown>;
            }
          } catch { /* ignore */ }
        }
      }
    }
    return { status, data: tx, leaderResult };
  } catch {
    return { status: "PENDING", data: null, leaderResult: null };
  }
}

export async function getVerification(mapId: string, nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_verification",
    args: [mapId, nodeId],
  });
  return parseContractResult(result);
}

export async function getSocialVerification(mapId: string, nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_social_verification",
    args: [mapId, nodeId],
  });
  return parseContractResult(result);
}

export async function getRelationshipVerification(mapId: string, edgeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_relationship_verification",
    args: [mapId, edgeId],
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
