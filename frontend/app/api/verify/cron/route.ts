import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyNode, getTransactionStatus, getVerification, DEFAULT_MAP_ID } from "@/lib/genlayer";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const count = Math.min(
    parseInt(request.nextUrl.searchParams.get("count") || "3"),
    5
  );

  const { data: nodes } = await supabase
    .from("nodes")
    .select("id, nombre, link, cluster, categoria, descripcion, verification_attempts")
    .eq("verified", false)
    .not("link", "is", null)
    .not("link", "like", "%instagram%")
    .neq("verification_status", "grey")
    .neq("verification_status", "pending")
    .order("verification_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(count);

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({ message: "No unverified nodes found", results: [] });
  }

  const results = [];

  for (const node of nodes) {
    const nodeResult: Record<string, unknown> = { nombre: node.nombre, id: node.id };

    try {
      await supabase
        .from("nodes")
        .update({ verification_status: "pending" })
        .eq("id", node.id);

      const txHash = await verifyNode(
        DEFAULT_MAP_ID,
        node.id,
        node.nombre,
        node.link || "",
        node.cluster || "",
        node.categoria || "",
        node.descripcion || "",
        "Argentina"
      );

      if (!txHash) {
        nodeResult.status = "submit_failed";
        results.push(nodeResult);
        continue;
      }

      nodeResult.txHash = txHash;

      let finalStatus = "timeout";
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 8000));

        const statusResult = await getTransactionStatus(txHash);
        const status = statusResult.status;

        if (status === "ACCEPTED" || status === "FINALIZED") {
          finalStatus = "verified";

          const details: Record<string, unknown> = {};
          try {
            const contractResult = await getVerification(DEFAULT_MAP_ID, node.id);
            if (contractResult && !contractResult.error) {
              details.exists = contractResult.exists === "yes" || contractResult.exists === true;
              details.sector_relevant = contractResult.sector_relevant === "yes" || contractResult.sector_relevant === true;
              details.description_accurate = contractResult.description_accurate === "yes" || contractResult.description_accurate === true;
              details.geography_relevant = contractResult.geography_relevant === "yes" || contractResult.geography_relevant === true;
            }
          } catch { /* contract read failed */ }

          await supabase
            .from("nodes")
            .update({
              verified: true,
              verification_tx: txHash,
              verification_date: new Date().toISOString(),
              verification_status: "verified",
              verification_details: details,
            })
            .eq("id", node.id);

          nodeResult.details = details;
          break;
        }

        if (status === "UNDETERMINED" || status === "CANCELED") {
          finalStatus = "failed";
          const attempts = (node.verification_attempts || 0) + 1;
          const lr = statusResult.leaderResult as Record<string, unknown> | null;
          const failureReason = lr?.reasoning || `GenLayer: ${status}`;

          await supabase
            .from("nodes")
            .update({
              verification_attempts: attempts,
              verification_status: attempts >= 3 ? "grey" : "failed",
              verification_failure_reason: String(failureReason),
            })
            .eq("id", node.id);

          break;
        }
      }

      nodeResult.status = finalStatus;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      nodeResult.status = "error";
      nodeResult.error = msg;

      await supabase
        .from("nodes")
        .update({ verification_status: "unverified" })
        .eq("id", node.id);
    }

    results.push(nodeResult);
  }

  return NextResponse.json({
    processed: results.length,
    verified: results.filter((r) => r.status === "verified").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}
