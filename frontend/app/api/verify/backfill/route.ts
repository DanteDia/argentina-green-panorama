import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getVerification } from "@/lib/genlayer";

/**
 * One-time backfill: re-read GenLayer results for verified nodes
 * that have empty verification_details (verified before column existed).
 *
 * GET /api/verify/backfill
 */
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Find verified nodes with empty or null verification_details
  const { data: nodes } = await supabase
    .from("nodes")
    .select("id, nombre")
    .eq("verified", true)
    .or("verification_details.is.null,verification_details.eq.{}");

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({ message: "No nodes need backfill", count: 0 });
  }

  const results = [];

  for (const node of nodes) {
    try {
      const result = await getVerification(node.id);

      if (result && !result.error) {
        const details = {
          exists: result.exists === "yes" || result.exists === true,
          green_sector: result.green_sector === "yes" || result.green_sector === true,
          description_accurate: result.description_accurate === "yes" || result.description_accurate === true,
          argentina_related: result.argentina_related === "yes" || result.argentina_related === true,
        };

        await supabase
          .from("nodes")
          .update({ verification_details: details })
          .eq("id", node.id);

        results.push({ nombre: node.nombre, status: "backfilled", details });
      } else {
        // No GenLayer result found — set all to true since node IS verified
        const details = {
          exists: true,
          green_sector: true,
          description_accurate: true,
          argentina_related: true,
        };

        await supabase
          .from("nodes")
          .update({ verification_details: details })
          .eq("id", node.id);

        results.push({ nombre: node.nombre, status: "defaulted", details });
      }
    } catch (err) {
      results.push({ nombre: node.nombre, status: "error", error: String(err) });
    }
  }

  return NextResponse.json({
    message: `Backfilled ${results.length} nodes`,
    count: results.length,
    results,
  });
}
