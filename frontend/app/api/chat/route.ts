import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import seedData from "@/lib/seed_data.json";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

// Event metadata for context-aware prompts
const EVENT_META: Record<string, { name: string; description: string }> = {
  "blockchainrio-2026": {
    name: "BlockchainRio 2026",
    description: "Latin America's largest blockchain conference — 20,000+ attendees, 400+ speakers, 70+ sponsors. Aug 5-7, 2026, Rio de Janeiro, Brazil.",
  },
};

async function getGlobalGraphContext(): Promise<string> {
  if (supabase) {
    try {
      const { data: nodes } = await supabase
        .from("nodes")
        .select("nombre, cluster, categoria, quien_fondea, aliados_portfolio, clientes, descripcion, verified")
        .limit(1000);
      const { data: edges } = await supabase
        .from("edges")
        .select("source_id, target_id, relationship_type, description")
        .limit(500);

      if (nodes && edges) {
        const { data: nodeIds } = await supabase.from("nodes").select("id, nombre").limit(1000);
        const idToName: Record<string, string> = {};
        if (nodeIds) for (const n of nodeIds) idToName[n.id] = n.nombre;

        return JSON.stringify({
          nodes: nodes.map(n => ({ nombre: n.nombre, cluster: n.cluster, categoria: n.categoria, descripcion: n.descripcion })),
          edges: edges.map(e => ({ from: idToName[e.source_id] || "?", to: idToName[e.target_id] || "?", type: e.relationship_type })),
        });
      }
    } catch { /* fall through */ }
  }

  return JSON.stringify({
    nodes: seedData.nodes.map(n => ({ nombre: n.nombre, cluster: n.cluster, categoria: n.categoria, descripcion: n.descripcion })),
    edges: seedData.edges.map(e => ({ from: e.source, to: e.target, type: e.type })),
  });
}

function buildSystemPrompt(context: string, lang: string, graphContext: string, nodeCount: number, edgeCount: number): string {
  const langInstruction = `Respond in ${lang === "es" ? "Spanish" : "English"}`;
  const highlightInstruction = `At the end of your response, add a JSON line: {"highlight": ["Company1", "Company2"]}. If no specific nodes to highlight, use {"highlight": []}`;

  const eventMeta = EVENT_META[context];

  if (eventMeta) {
    // Event-specific prompt
    return `You are an AI assistant for ${eventMeta.name}, powered by IndustriesVerified.
${eventMeta.description}

You have access to data about ${nodeCount} companies/organizations participating in this event and their ${edgeCount} connections.

EVENT DATA:
${graphContext}

INSTRUCTIONS:
- Answer questions about this event's ecosystem using the data above
- Be specific: name companies, describe relationships, mention their role (sponsor, speaker, exhibitor)
- When mentioning companies, include their cluster/sector in parentheses
- You can discuss: sponsors, partnerships between attendees, sector breakdown, competitive landscape, investment relationships
- If a company has an event_role or event_sponsor_tier, mention it
- If asked about something NOT in this event's data, say "That company/topic isn't in the ${eventMeta.name} database, but it may be covered on the broader IndustriesVerified platform."
- ${langInstruction}
- Keep answers concise but informative (max 250 words)
- Use markdown formatting: **bold** for company names, bullet lists for multiple items
- ${highlightInstruction}`;
  }

  // Default: Green Panorama / global
  return `You are an AI assistant for IndustriesVerified, an expert on industry ecosystems. You currently have access to data about ${nodeCount}+ organizations and their relationships.

GRAPH DATA:
${graphContext}

INSTRUCTIONS:
- Answer questions about the ecosystem using ONLY the data provided above
- Be specific: name companies, describe relationships, cite data fields
- When mentioning companies, include their cluster type in parentheses
- If asked about connections, trace the relationship chain
- If data is insufficient, say so honestly
- ${langInstruction}
- Keep answers concise but informative (max 250 words)
- Use markdown formatting: **bold** for company names, bullet lists for multiple items
- ${highlightInstruction}`;
}

export async function POST(request: NextRequest) {
  try {
    const { message, lang = "es", context, graphData } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!OPENROUTER_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
    }

    // Use frontend-provided graph data if available (avoids extra DB query)
    let graphContext: string;
    let nodeCount: number;
    let edgeCount: number;

    if (graphData && graphData.nodes && graphData.nodes.length > 0) {
      graphContext = JSON.stringify(graphData);
      nodeCount = graphData.nodes.length;
      edgeCount = graphData.edges?.length || 0;
    } else {
      graphContext = await getGlobalGraphContext();
      const parsed = JSON.parse(graphContext);
      nodeCount = parsed.nodes?.length || 0;
      edgeCount = parsed.edges?.length || 0;
    }

    const systemPrompt = buildSystemPrompt(context || "green-panorama", lang, graphContext, nodeCount, edgeCount);

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
        max_tokens: 600,
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
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
