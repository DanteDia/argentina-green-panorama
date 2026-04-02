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

// VerifiableIndustries v5 contract on GenLayer Studio
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT ||
  "0xe8760c16A5eB8368612d421d1185B76b501F6e11") as Address;

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

// =========================================================================
// WRITE METHODS — 1 TX per claim, all prompt_comparative
// =========================================================================

/** Verify entity existence */
export async function verifyExistence(mapId: string, nodeId: string, name: string, url: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_existence",
    args: [mapId, nodeId, name, url || ""],
    value: 0n,
  });
}

/** Verify entity description accuracy */
export async function verifyDescription(mapId: string, nodeId: string, name: string, url: string, description: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_description",
    args: [mapId, nodeId, name, url || "", description || ""],
    value: 0n,
  });
}

/** Verify entity sector classification */
export async function verifySector(mapId: string, nodeId: string, name: string, url: string, sector: string, category: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_sector",
    args: [mapId, nodeId, name, url || "", sector || "", category || ""],
    value: 0n,
  });
}

/** Verify entity is still active */
export async function verifyRecency(mapId: string, nodeId: string, name: string, url: string, country: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_recency",
    args: [mapId, nodeId, name, url || "", country || ""],
    value: 0n,
  });
}

/** Verify a single funding relationship — checks BOTH sides */
export async function verifyFunding(mapId: string, claimId: string, investorName: string, investorUrl: string, companyName: string, companyUrl: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_funding",
    args: [mapId, claimId, investorName, investorUrl || "", companyName, companyUrl || ""],
    value: 0n,
  });
}

/** Verify a single relationship — conflict detection */
export async function verifyRelationship(mapId: string, edgeId: string, entityA: string, urlA: string, entityB: string, urlB: string, claimedType: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_relationship",
    args: [mapId, edgeId, entityA, urlA || "", entityB, urlB || "", claimedType || ""],
    value: 0n,
  });
}

/** Verify a single social media profile */
export async function verifySocial(mapId: string, nodeId: string, name: string, platform: string, socialUrl: string, claimedFollowers: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "verify_social",
    args: [mapId, nodeId, name, platform, socialUrl, claimedFollowers || "0"],
    value: 0n,
  });
}

/** Adversarial hallucination detection on full agent output */
export async function detectHallucination(mapId: string, nodeId: string, name: string, url: string, agentOutput: string): Promise<string> {
  const client = getClient();
  return client.writeContract({
    address: getContractAddress(),
    functionName: "detect_hallucination",
    args: [mapId, nodeId, name, url || "", agentOutput],
    value: 0n,
  });
}

// Legacy wrapper — delegates to individual methods
export async function verifyNode(
  mapId: string, nodeId: string, nombre: string, link: string,
  sector: string, categoria: string, descripcion: string,
  country: string, _claimedFunding: string = "",
): Promise<string> {
  // Start with existence check — the most fundamental claim
  return verifyExistence(mapId, nodeId, nombre, link);
}

// =========================================================================
// STATUS + READ METHODS
// =========================================================================

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

/** Read a specific claim result */
export async function getClaim(mapId: string, claimKey: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_claim",
    args: [mapId, claimKey],
  });
  return parseContractResult(result);
}

/** Read all verification claims for a node */
export async function getNodeVerification(mapId: string, nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_node_verification",
    args: [mapId, nodeId],
  });
  return parseContractResult(result);
}

/** Legacy compatibility */
export async function getVerification(mapId: string, nodeId: string) {
  return getNodeVerification(mapId, nodeId);
}

export async function getRelationshipVerification(mapId: string, edgeId: string) {
  return getClaim(mapId, `${edgeId}:relationship`);
}

export async function getSocialVerification(mapId: string, nodeId: string) {
  // Social is stored per-platform, return generic lookup
  return getClaim(mapId, `${nodeId}:social:twitter`);
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
