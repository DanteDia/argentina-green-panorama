import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyNode, getTransactionStatus } from "@/lib/genlayer";

/**
 * Verification Cron Endpoint
 *
 * Picks unverified nodes from Supabase, submits them to GenLayer,
 * polls for result, and updates the database.
 *
 * Call: GET /api/verify/cron?count=3
 * Can be triggered by Vercel Cron, external scheduler, or manually.
 */
export const maxDuration = 300; // 5 min max for Vercel serverless

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const count = Math.min(
    parseInt(request.nextUrl.searchParams.get("count") || "3"),
    5
  );

  // Get unverified nodes with real URLs (not instagram, not grey, not pending)
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
      // Mark as pending
      await supabase
        .from("nodes")
        .update({ verification_status: "pending" })
        .eq("id", node.id);

      // Submit to GenLayer
      const txHash = await verifyNode(
        node.id,
        node.nombre,
        node.link || "",
        node.cluster || "",
        node.categoria || "",
        node.descripcion || ""
      );

      if (!txHash) {
        nodeResult.status = "submit_failed";
        results.push(nodeResult);
        continue;
      }

      nodeResult.txHash = txHash;

      // Poll for result (max 40 attempts, 8s apart = ~5.3 min)
      let finalStatus = "timeout";
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 8000));

        const statusResult = await getTransactionStatus(txHash);
        const status = statusResult.status;

        if (status === "ACCEPTED" || status === "FINALIZED") {
          finalStatus = "verified";

          // Extract per-field verification details from leader result
          const lr = statusResult.leaderResult as Record<string, unknown> | null;
          const details: Record<string, unknown> = {};
          if (lr) {
            details.exists = lr.exists === "yes" || lr.exists === true;
            details.green_sector = lr.green_sector === "yes" || lr.green_sector === true;
            details.description_accurate = lr.description_accurate === "yes" || lr.description_accurate === true;
            details.argentina_related = lr.argentina_related === "yes" || lr.argentina_related === true;
          }

          // Update Supabase with per-field details
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

          // Extract leader result even on failure for debugging
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

      // Reset from pending
      await supabase
        .from("nodes")
        .update({ verification_status: "unverified" })
        .eq("id", node.id);
    }

    results.push(nodeResult);
  }

  const verified = results.filter((r) => r.status === "verified").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    processed: results.length,
    verified,
    failed,
    results,
  });
}
