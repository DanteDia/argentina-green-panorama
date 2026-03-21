import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

async function getGraphContext(): Promise<string> {
  // Try Supabase first
  if (supabase) {
    try {
      const { data: nodes } = await supabase
        .from("nodes")
        .select("nombre, cluster, categoria, quien_fondea, aliados_portfolio, clientes, descripcion, verified, link, followers");
      const { data: edges } = await supabase
        .from("edges")
        .select("source_id, target_id, relationship_type, description")
        .limit(200);

      if (nodes && edges) {
        // Build a name lookup for edges
        const { data: nodeIds } = await supabase.from("nodes").select("id, nombre");
        const idToName: Record<string, string> = {};
        if (nodeIds) for (const n of nodeIds) idToName[n.id] = n.nombre;

        const edgeList = edges.map(e => ({
          from: idToName[e.source_id] || e.source_id,
          to: idToName[e.target_id] || e.target_id,
          type: e.relationship_type,
          description: e.description,
        }));

        return JSON.stringify({ nodes, edges: edgeList });
      }
    } catch { /* fall through */ }
  }

  // Fallback to seed data
  return JSON.stringify({
    nodes: seedData.nodes.map(n => ({
      nombre: n.nombre, cluster: n.cluster, categoria: n.categoria,
      quien_fondea: n.quien_fondea, aliados_portfolio: n.aliados_portfolio,
      clientes: n.clientes, descripcion: n.descripcion, verified: false,
    })),
    edges: seedData.edges.map(e => ({
      from: e.source, to: e.target, type: e.type, description: e.description,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { message, lang = "es" } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!OPENROUTER_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
    }

    const graphContext = await getGraphContext();

    const systemPrompt = `You are Green Panorama AI, an expert on Argentina's green/carbon market ecosystem. You have access to a database of ${seedData.nodes.length}+ organizations (companies, NGOs, funds, startups, government agencies) and their relationships.

GRAPH DATA:
${graphContext}

INSTRUCTIONS:
- Answer questions about Argentina's green ecosystem using ONLY the data provided above
- Be specific: name companies, describe relationships, cite data fields
- When mentioning companies, include their cluster type in parentheses
- If asked about connections, trace the relationship chain
- If data is insufficient, say so honestly
- Respond in ${lang === "es" ? "Spanish" : "English"}
- Keep answers concise but informative (max 200 words)
- At the end of your response, add a JSON line with node names to highlight: {"highlight": ["Company1", "Company2"]}
- If no specific nodes to highlight, use {"highlight": []}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response";

    // Extract highlight JSON from the end of the response
    let highlight: string[] = [];
    let answer = content;
    const highlightMatch = content.match(/\{"highlight":\s*\[.*?\]\}/);
    if (highlightMatch) {
      try {
        const parsed = JSON.parse(highlightMatch[0]);
        highlight = parsed.highlight || [];
        answer = content.replace(highlightMatch[0], "").trim();
      } catch { /* ignore */ }
    }

    return NextResponse.json({ answer, highlight });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
