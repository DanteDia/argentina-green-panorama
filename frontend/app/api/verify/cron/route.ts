import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyNode, verifyRelationship, getTransactionStatus, getVerification, getRelationshipVerification, DEFAULT_MAP_ID } from "@/lib/genlayer";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // type=nodes (default) or type=edges — run separately to avoid Vercel 300s timeout
  const verifyType = request.nextUrl.searchParams.get("type") || "nodes";

  if (verifyType === "edges") {
    return verifyEdges();
  }

  const count = Math.min(
    parseInt(request.nextUrl.searchParams.get("count") || "3"),
    5
  );

  const { data: nodes } = await supabase
    .from("nodes")
    .select("id, nombre, link, cluster, categoria, descripcion, quien_fondea, verification_attempts")
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
        "Argentina",
        node.quien_fondea || ""
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
              details.funding_accurate = contractResult.funding_accurate === "yes" || contractResult.funding_accurate === true;
              if (contractResult.verified_funders) {
                details.verified_funders = contractResult.verified_funders;
              }
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

  // Relationship verification moved to separate ?type=edges call
  return NextResponse.json({
    processed: results.length,
    verified: results.filter((r) => r.status === "verified").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}

async function verifyEdges() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const edgeResults: Record<string, unknown>[] = [];
  try {
    const { data: edges } = await supabase
      .from("edges")
      .select("id, source_id, target_id, relationship_type, description")
      .is("verified", null)
      .limit(1);

    if (edges && edges.length > 0) {
      for (const edge of edges) {
        // Get both node names and links
        const { data: sourceNode } = await supabase.from("nodes").select("nombre, link").eq("id", edge.source_id).single();
        const { data: targetNode } = await supabase.from("nodes").select("nombre, link").eq("id", edge.target_id).single();

        if (!sourceNode || !targetNode) continue;

        const edgeResult: Record<string, unknown> = {
          edgeId: edge.id,
          source: sourceNode.nombre,
          target: targetNode.nombre,
          type: edge.relationship_type,
        };

        try {
          const txHash = await verifyRelationship(
            DEFAULT_MAP_ID,
            edge.id,
            sourceNode.nombre,
            sourceNode.link || "",
            targetNode.nombre,
            targetNode.link || "",
            edge.relationship_type || "",
            edge.description || "",
            "Green/Carbon/Environmental",
            "Argentina"
          );

          if (!txHash) { edgeResult.status = "submit_failed"; edgeResults.push(edgeResult); continue; }

          // Poll for result
          for (let attempt = 0; attempt < 40; attempt++) {
            await new Promise((r) => setTimeout(r, 8000));
            const statusResult = await getTransactionStatus(txHash);

            if (statusResult.status === "ACCEPTED" || statusResult.status === "FINALIZED") {
              // Read result from contract
              let relResult: Record<string, unknown> | null = null;
              try {
                relResult = await getRelationshipVerification(DEFAULT_MAP_ID, edge.id) as Record<string, unknown>;
              } catch { /* ignore */ }

              const confirmed = relResult?.relationship_confirmed === true || relResult?.relationship_confirmed === "true";
              const typeAccurate = relResult?.type_accurate === true || relResult?.type_accurate === "true";
              const suggestedType = relResult?.suggested_type as string || edge.relationship_type;

              // Update edge verification
              await supabase.from("edges").update({
                verified: confirmed,
                verification_tx: txHash,
              }).eq("id", edge.id);

              // Update source node's verification_details.relationships
              const { data: srcNode } = await supabase.from("nodes").select("verification_details").eq("id", edge.source_id).single();
              const details = (srcNode?.verification_details as Record<string, unknown>) || {};
              const relationships = (details.relationships as Record<string, boolean>) || {};
              relationships[targetNode.nombre] = confirmed;
              details.relationships = relationships;
              await supabase.from("nodes").update({ verification_details: details }).eq("id", edge.source_id);

              // If type was wrong, update the edge type
              if (confirmed && !typeAccurate && suggestedType) {
                await supabase.from("edges").update({ relationship_type: suggestedType }).eq("id", edge.id);
                edgeResult.type_corrected = suggestedType;
              }

              edgeResult.status = "verified";
              edgeResult.confirmed = confirmed;
              edgeResult.txHash = txHash;
              break;
            }

            if (statusResult.status === "UNDETERMINED" || statusResult.status === "CANCELED") {
              edgeResult.status = "failed";
              break;
            }
          }
        } catch (err: unknown) {
          edgeResult.status = "error";
          edgeResult.error = err instanceof Error ? err.message : "Unknown";
        }

        edgeResults.push(edgeResult);
      }
    }
  } catch { /* relationship verification failed */ }

  return NextResponse.json({
    processed: edgeResults.length,
    verified: edgeResults.filter((r) => r.status === "verified").length,
    failed: edgeResults.filter((r) => r.status === "failed").length,
    results: edgeResults,
  });
}
