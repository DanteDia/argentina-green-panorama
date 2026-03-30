import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const SONAR_MODEL = "perplexity/sonar";
const LLM_MODEL = "google/gemini-2.0-flash-001";

const VALID_SYNERGY_TYPES = [
  "potential_client",
  "potential_partner",
  "investor_match",
  "talent_pipeline",
  "technology_complement",
  "market_expansion",
];

interface SynergyMatch {
  nodeId: string;
  name: string;
  cluster: string;
  synergyType: string;
  score: number;
  reasoning: string;
  actionItems: string[];
}

function extractJson(content: string, array: boolean = true): unknown {
  // Strip markdown code fences
  content = content.replace(/```(?:json)?\s*/g, "").trim();

  const openChar = array ? "[" : "{";
  const closeChar = array ? "]" : "}";

  const start = content.indexOf(openChar);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < content.length; i++) {
    const c = content[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === "\\" && inString) { escapeNext = true; continue; }
    if (c === '"' && !escapeNext) { inString = !inString; continue; }
    if (inString) continue;
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(content.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }

  return null;
}

async function callOpenRouter(
  model: string,
  messages: { role: string; content: string }[],
  temperature: number = 0.2,
  maxTokens: number = 2000
): Promise<string> {
  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function researchCompany(
  companyUrl: string,
  companyName?: string
): Promise<Record<string, unknown>> {
  const nameHint = companyName ? ` (company name: "${companyName}")` : "";

  const prompt = `Research the company at this URL: ${companyUrl}${nameHint}

Provide a comprehensive profile including:
1. Company name
2. What they do (products/services)
3. Their sector/industry
4. Target market and customers
5. Technology stack or key capabilities
6. Company stage (startup, growth, enterprise)
7. Geographic focus
8. Key partnerships or integrations
9. What they might be looking for (clients, partners, investors, talent)

Respond ONLY as JSON:
{
  "name": "Company Name",
  "description": "Brief description",
  "sector": "Their main sector",
  "products": ["product1", "product2"],
  "target_market": "Who they sell to",
  "technology": ["tech1", "tech2"],
  "stage": "startup|growth|enterprise",
  "geography": "Where they operate",
  "looking_for": ["clients", "partners"],
  "keywords": ["keyword1", "keyword2"]
}`;

  const content = await callOpenRouter(SONAR_MODEL, [{ role: "user", content: prompt }], 0.1, 1000);
  const data = extractJson(content, false) as Record<string, unknown> | null;
  return data || { name: companyName || companyUrl, error: "parse_failed" };
}

async function fetchEventParticipants(slug: string) {
  if (!supabase) return [];

  const { data: participants, error: partErr } = await supabase
    .from("event_participants")
    .select("node_id, role, sponsor_tier")
    .eq("event_slug", slug);

  if (partErr || !participants || participants.length === 0) return [];

  const nodeIds = participants.map((p) => p.node_id);

  const { data: nodes, error: nodesErr } = await supabase
    .from("nodes")
    .select("id, nombre, link, cluster, categoria, descripcion, quien_fondea, aliados_portfolio, clientes")
    .in("id", nodeIds);

  if (nodesErr || !nodes) return [];

  const meta = Object.fromEntries(participants.map((p) => [p.node_id, p]));

  return nodes.map((n) => ({
    ...n,
    role: meta[n.id]?.role || "",
    sponsor_tier: meta[n.id]?.sponsor_tier || "",
  }));
}

async function scoreSynergies(
  companyProfile: Record<string, unknown>,
  participants: Record<string, unknown>[]
): Promise<SynergyMatch[]> {
  const participantSummaries = participants.map((p) => ({
    id: p.id,
    name: p.nombre,
    cluster: p.cluster || "",
    category: p.categoria || "",
    description: p.descripcion || "",
    funding: p.quien_fondea || "",
    partners: p.aliados_portfolio || [],
    clients: p.clientes || [],
  }));

  const prompt = `You are an expert business development analyst at a blockchain/crypto conference.

USER'S COMPANY PROFILE:
${JSON.stringify(companyProfile, null, 2)}

EVENT PARTICIPANTS:
${JSON.stringify(participantSummaries, null, 2)}

For each participant, evaluate the synergy with the user's company. Score each match from 0.0 to 1.0.

SYNERGY TYPES (choose the best fit):
- "potential_client": They could buy the user's product/service
- "potential_partner": Mutual benefit from partnering/integrating
- "investor_match": They invest in companies like the user's (or vice versa)
- "talent_pipeline": They could provide talent or the user could hire from them
- "technology_complement": Their tech complements the user's stack
- "market_expansion": They could help the user enter new markets

RULES:
- Only include matches with score >= 0.3
- Maximum 20 matches
- Sort by score descending
- Be specific in reasoning — mention actual products, services, or capabilities
- Action items should be concrete next steps for the conference

Respond ONLY as a JSON array:
[{
  "node_id": "uuid",
  "company_name": "Name",
  "cluster": "Their cluster",
  "synergy_type": "potential_client|potential_partner|investor_match|talent_pipeline|technology_complement|market_expansion",
  "score": 0.85,
  "reasoning": "Specific reason why this is a good match",
  "action_items": ["Visit their booth", "Propose integration demo"]
}]`;

  const content = await callOpenRouter(LLM_MODEL, [{ role: "user", content: prompt }], 0.3, 4000);
  const results = extractJson(content, true) as Record<string, unknown>[] | null;

  if (!results || !Array.isArray(results)) return [];

  const matches: SynergyMatch[] = [];
  for (const r of results) {
    const score = Number(r.score) || 0;
    if (score < 0.3) continue;

    let synergyType = String(r.synergy_type || "potential_partner");
    if (!VALID_SYNERGY_TYPES.includes(synergyType)) synergyType = "potential_partner";

    matches.push({
      nodeId: String(r.node_id || ""),
      name: String(r.company_name || ""),
      cluster: String(r.cluster || ""),
      synergyType,
      score: Math.min(1.0, Math.max(0.0, score)),
      reasoning: String(r.reasoning || ""),
      actionItems: Array.isArray(r.action_items) ? r.action_items.map(String) : [],
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 20);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { companyUrl, companyName } = body as {
      companyUrl: string;
      companyName?: string;
    };

    if (!companyUrl) {
      return NextResponse.json({ error: "companyUrl is required" }, { status: 400 });
    }

    // Step 1: Research the user's company
    const profile = await researchCompany(companyUrl, companyName);
    if (profile.error) {
      return NextResponse.json(
        { error: `Could not research company: ${profile.error}` },
        { status: 422 }
      );
    }

    // Step 2: Fetch event participants
    const participants = await fetchEventParticipants(slug);
    if (participants.length === 0) {
      return NextResponse.json(
        { error: "No participants found for this event" },
        { status: 404 }
      );
    }

    // Step 3: Score synergies
    const matches = await scoreSynergies(profile, participants);

    // Step 4: Try to store results (non-blocking, don't fail if table doesn't exist)
    try {
      const rows = matches.map((m) => ({
        event_slug: slug,
        company_url: companyUrl,
        node_id: m.nodeId,
        company_name: m.name,
        synergy_type: m.synergyType,
        score: m.score,
        reasoning: m.reasoning,
        action_items: m.actionItems,
      }));
      if (rows.length > 0) {
        await supabase.from("synergies").insert(rows);
      }
    } catch {
      // Non-critical — table may not exist yet
    }

    return NextResponse.json({
      companyName: profile.name || companyName || companyUrl,
      companySummary: profile.description || "",
      matches,
    });
  } catch (err) {
    console.error("Opportunity matching error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
