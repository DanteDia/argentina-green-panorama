// Server-only GenLayer client for Next.js API routes
// Never import this file from client components

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Address } from "viem";

// Contract deployed on GenLayer Studio (studionet)
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_GENLAYER_CONTRACT ||
  "0x29d01F734B806bBc735e3e7C175C234c6a643B4C") as Address;

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

export async function getTransactionStatus(txHash: string) {
  const client = getClient();
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      status: "ACCEPTED" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      retries: 1,
      interval: 2000,
    });
    return { status: receipt.status, data: receipt };
  } catch {
    return { status: "PENDING", data: null };
  }
}

export async function getVerification(nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_verification",
    args: [nodeId],
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}

export async function getSocialVerification(nodeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_social_verification",
    args: [nodeId],
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}

export async function getRelationshipVerification(edgeId: string) {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_relationship_verification",
    args: [edgeId],
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}

export async function getContractStats() {
  const client = getClient();
  const result = await client.readContract({
    address: getContractAddress(),
    functionName: "get_stats",
    args: [],
  });
  return typeof result === "string" ? JSON.parse(result) : result;
}
