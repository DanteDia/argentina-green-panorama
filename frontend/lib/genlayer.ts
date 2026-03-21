// Server-only GenLayer client for Next.js API routes
// Never import this file from client components

import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { Address } from "viem";

const privateKey = process.env.GENLAYER_PRIVATE_KEY as `0x${string}` | undefined;
const contractAddress = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT as Address | undefined;

function getClient() {
  if (!privateKey) throw new Error("GENLAYER_PRIVATE_KEY not set");
  const account = createAccount(privateKey);
  return createClient({
    chain: testnetBradbury,
    account,
  });
}

export function getContractAddress(): Address {
  if (!contractAddress) throw new Error("NEXT_PUBLIC_GENLAYER_CONTRACT not set");
  return contractAddress;
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
    args: [nodeId, nombre, link || "", cluster, categoria, descripcion],
    value: 0n,
  });
  return hash;
}

export async function verifySocial(
  nodeId: string,
  nombre: string,
  socialLinks: string[], // URLs
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
    args: [edgeId, nodeAName, nodeALink, nodeBName, nodeBLink, relationshipType, relationshipDescription],
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
