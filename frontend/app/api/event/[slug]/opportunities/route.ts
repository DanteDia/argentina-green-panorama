import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const SONAR_MODEL = "perplexity/sonar";
const LLM_MODEL = "google/gemini-2.0-flash-001";

const VALID_SYNERGY_TYPES = [
  "existing_relationship", "potential_client", "potential_partner",
  "investor_match", "talent_pipeline", "technology_complement", "market_expansion",
];

interface ContactInfo {
  email?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
  contact_form?: string;
  contact_person?: string;
}

interface BDPerson {
  name: string;
  title?: string;
  platform: "linkedin" | "x";
  profile_url: string;
  snippet?: string;
  confidence?: number;
}

interface OutboundMessages {
  x_dm?: string;
  linkedin_note?: string;
  email_subject?: string;
  email_body?: string;
}

interface SynergyMatch {
  nodeId: string;
  name: string;
  cluster: string;
  synergyType: string;
  score: number;
  reasoning: string;
  actionItems: string[];
  existingRelationship?: boolean;
  intelSignal?: string;
  contactInfo?: ContactInfo;
  bdPeople?: BDPerson[];
  outboundMessages?: OutboundMessages;
}

function extractJson(content: string, array: boolean = true): unknown {
  content = content.replace(/```(?:json)?\s*/g, "").trim();
  const openChar = array ? "[" : "{";
  const closeChar = array ? "]" : "}";
  const start = content.indexOf(openChar);
  if (start === -1) return null;
  let depth = 0, inString = false, escapeNext = false;
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
        try { return JSON.parse(content.slice(start, i + 1)); }
        catch { break; }
      }
    }
  }
  return null;
}

async function callOpenRouter(model: string, messages: { role: string; content: string }[], temperature = 0.2, maxTokens = 2000): Promise<string> {
  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// =============================================================================
// PHASE 1: Deep Company Research — 3 parallel Perplexity queries
// =============================================================================

async function deepResearchCompany(companyUrl: string, companyName?: string): Promise<Record<string, unknown>> {
  const nameHint = companyName ? `"${companyName}"` : "the company";

  // Step 0: Fetch the actual website to ground the research
  let websiteContent = "";
  try {
    const siteRes = await fetch(companyUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (siteRes.ok) {
      const html = await siteRes.text();
      // Strip HTML tags, keep text content
      websiteContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000);
    }
  } catch { /* timeout or error — proceed without */ }

  const siteContext = websiteContent
    ? `\n\nHere is the ACTUAL content from their website (${companyUrl}). Use this as ground truth — do NOT confuse this company with any other:\n---\n${websiteContent}\n---\n`
    : "";

  // Query 1: Core identity & specialization
  const q1 = callOpenRouter(SONAR_MODEL, [{ role: "user", content:
    `Research ${companyUrl} (${nameHint}) deeply. What makes this company UNIQUE?${siteContext}
Based on their ACTUAL website content above and your knowledge:
1. Their CORE specialization (the specific niche, NOT generic like "web design" or "consulting")
2. Specific projects or campaigns they've done (name real examples from their portfolio)
3. What technology/medium they specialize in (CGI, AI, blockchain, holograms, etc.)
4. Their company size and stage

Return JSON: {"core_specialization": "specific niche", "notable_projects": ["project1"], "technology_focus": ["tech1"], "stage": "startup|growth|enterprise"}`
  }], 0.1, 800);

  // Query 2: Clients, partners, industry connections
  const q2 = callOpenRouter(SONAR_MODEL, [{ role: "user", content:
    `Who has ${nameHint} (${companyUrl}) worked with? I need REAL company names.${siteContext}
Based on their website portfolio/clients page and your knowledge:
1. Known clients (companies that paid them for services — look at their portfolio/case studies)
2. Known partners (companies they collaborate with)
3. Industry associations or events they participate in
4. Any crypto/blockchain/Web3 connections

Return JSON: {"known_clients": ["Client1"], "known_partners": ["Partner1"], "events": ["Event1"], "crypto_connections": ["Connection1"]}`
  }], 0.1, 800);

  // Query 3: Geography & market focus
  const q3 = callOpenRouter(SONAR_MODEL, [{ role: "user", content:
    `Where does ${nameHint} (${companyUrl}) operate?${siteContext}
1. Headquarters location
2. Office locations (look for addresses on their website)
3. Geographic markets they serve
4. Target customer profile

Return JSON: {"headquarters": "city", "offices": ["city1"], "markets": ["market1"], "target_customers": "description"}`
  }], 0.1, 600);

  // Run all 3 in parallel
  const [r1, r2, r3] = await Promise.all([q1, q2, q3]);

  const p1 = (extractJson(r1, false) as Record<string, unknown>) || {};
  const p2 = (extractJson(r2, false) as Record<string, unknown>) || {};
  const p3 = (extractJson(r3, false) as Record<string, unknown>) || {};

  // Merge into rich profile
  return {
    name: companyName || companyUrl,
    url: companyUrl,
    core_specialization: p1.core_specialization || "unknown",
    notable_projects: p1.notable_projects || [],
    technology_focus: p1.technology_focus || [],
    stage: p1.stage || "unknown",
    known_clients: p2.known_clients || [],
    known_partners: p2.known_partners || [],
    events: p2.events || [],
    crypto_connections: p2.crypto_connections || [],
    headquarters: p3.headquarters || "",
    offices: p3.offices || [],
    markets: p3.markets || [],
    target_customers: p3.target_customers || "",
  };
}

// =============================================================================
// PHASE 2: Fetch participants + intelligence + detect existing relationships
// =============================================================================

async function fetchEnrichedParticipants(slug: string, companyProfile: Record<string, unknown>) {
  if (!supabase) {
    console.error("[opp] supabase client is null");
    return { participants: [], existingRelationships: [] as string[] };
  }

  // Get participants
  const { data: parts, error: partErr } = await supabase
    .from("event_participants")
    .select("node_id, role, sponsor_tier")
    .eq("event_slug", slug);
  console.log(`[opp] event_participants for slug=${slug}: ${parts?.length || 0} rows, err=${partErr?.message || "none"}`);
  if (!parts || parts.length === 0) return { participants: [], existingRelationships: [] as string[] };

  const nodeIds = parts.map((p) => p.node_id);
  const meta = Object.fromEntries(parts.map((p) => [p.node_id, p]));

  // Get node data — try with contact_info first; fall back if column doesn't exist yet
  interface NodeRow {
    id: string;
    nombre: string;
    link: string | null;
    cluster: string | null;
    categoria: string | null;
    descripcion: string | null;
    quien_fondea: string | null;
    aliados_portfolio: string[] | null;
    clientes: string[] | null;
    contact_info?: ContactInfo | null;
  }
  let nodes: NodeRow[] | null = null;
  {
    const { data, error } = await supabase
      .from("nodes")
      .select("id, nombre, link, cluster, categoria, descripcion, quien_fondea, aliados_portfolio, clientes, contact_info")
      .in("id", nodeIds);
    if (error) {
      // Likely contact_info column doesn't exist — retry without it
      const fallback = await supabase
        .from("nodes")
        .select("id, nombre, link, cluster, categoria, descripcion, quien_fondea, aliados_portfolio, clientes")
        .in("id", nodeIds);
      nodes = (fallback.data as NodeRow[] | null);
    } else {
      nodes = (data as NodeRow[] | null);
    }
  }
  if (!nodes) return { participants: [], existingRelationships: [] as string[] };

  // Get intelligence signals for all participants (top 3 per node)
  const { data: intel } = await supabase
    .from("node_intelligence")
    .select("node_id, intel_type, title, content")
    .in("node_id", nodeIds)
    .order("engagement_score", { ascending: false })
    .limit(150);

  const intelByNode: Record<string, { type: string; title: string; content: string }[]> = {};
  if (intel) {
    for (const i of intel) {
      if (!intelByNode[i.node_id]) intelByNode[i.node_id] = [];
      if (intelByNode[i.node_id].length < 3) {
        intelByNode[i.node_id].push({ type: i.intel_type, title: i.title, content: i.content });
      }
    }
  }

  // Detect existing relationships
  const companyName = String(companyProfile.name || "").toLowerCase();
  const knownClients = ((companyProfile.known_clients as string[]) || []).map(s => s.toLowerCase());
  const knownPartners = ((companyProfile.known_partners as string[]) || []).map(s => s.toLowerCase());
  const existingRelationships: string[] = [];

  const participants = nodes.map((n) => {
    const nameLower = n.nombre.toLowerCase();

    // Check if user's company is in participant's data
    const inPartnerList = (n.aliados_portfolio || []).some((p: string) => p.toLowerCase().includes(companyName));
    const inClientList = (n.clientes || []).some((c: string) => c.toLowerCase().includes(companyName));
    const inDescription = (n.descripcion || "").toLowerCase().includes(companyName);

    // Check if participant is in user's known clients/partners
    const isKnownClient = knownClients.some(c => c.includes(nameLower) || nameLower.includes(c));
    const isKnownPartner = knownPartners.some(p => p.includes(nameLower) || nameLower.includes(p));

    const hasExistingRelationship = inPartnerList || inClientList || inDescription || isKnownClient || isKnownPartner;
    if (hasExistingRelationship) existingRelationships.push(n.nombre);

    const signals = intelByNode[n.id] || [];

    return {
      id: n.id,
      nombre: n.nombre,
      link: n.link,
      cluster: n.cluster || "",
      categoria: n.categoria || "",
      descripcion: n.descripcion || "",
      quien_fondea: n.quien_fondea || "",
      aliados_portfolio: n.aliados_portfolio || [],
      clientes: n.clientes || [],
      role: meta[n.id]?.role || "",
      sponsor_tier: meta[n.id]?.sponsor_tier || "",
      intelligence: signals,
      existing_relationship: hasExistingRelationship,
      contact_info: n.contact_info || {},
    };
  });

  return { participants, existingRelationships };
}

// =============================================================================
// PHASE 3: Score synergies with specificity + intelligence
// =============================================================================

async function scoreSynergies(
  companyProfile: Record<string, unknown>,
  participants: Record<string, unknown>[],
  existingRelationships: string[],
  eventName: string,
  goals?: string[],
  specificContext?: string,
): Promise<SynergyMatch[]> {
  // Build participant summaries with intelligence
  const summaries = participants.map((p) => {
    const intel = (p.intelligence as { type: string; title: string; content: string }[]) || [];
    const intelText = intel.length > 0
      ? "\n    Recent signals: " + intel.map(i => `[${i.type}] ${i.title}`).join("; ")
      : "";

    return {
      id: p.id,
      name: p.nombre,
      cluster: p.cluster || "",
      description: (p.descripcion as string || "").slice(0, 300),
      role: p.role || "",
      sponsor_tier: p.sponsor_tier || "",
      existing_relationship: p.existing_relationship || false,
      recent_intel: intelText,
    };
  });

  const prompt = `You are a senior business development advisor preparing someone for ${eventName}.
Your recommendations must be SPECIFIC and HIGH-VALUE — not generic.

THE USER'S COMPANY (deep profile):
${JSON.stringify(companyProfile, null, 2)}

EXISTING RELATIONSHIPS DETECTED (these companies already work with or know the user):
${existingRelationships.length > 0 ? existingRelationships.join(", ") : "None detected"}

EVENT PARTICIPANTS (${summaries.length} companies, enriched with intelligence):
${JSON.stringify(summaries, null, 2)}

${goals && goals.length > 0 ? `THE USER'S GOALS AT THIS EVENT:
- Looking for: ${goals.join(", ")}
${specificContext ? `- Specific context: "${specificContext}"` : ""}

MATCHING RULES (goal-oriented):
1. HIGHEST PRIORITY (score 0.9-1.0): Companies the user ALREADY works with + companies that directly serve the stated goals
2. HIGH PRIORITY (score 0.7-0.9): Companies whose capabilities match the user's goals` : `MATCHING RULES — READ CAREFULLY:
1. HIGHEST PRIORITY (score 0.9-1.0): Companies the user ALREADY works with → reconnect at the event
2. HIGH PRIORITY (score 0.7-0.9): Companies whose specific capabilities/needs align with the user's UNIQUE specialization`}
3. MEDIUM (score 0.4-0.7): Companies in complementary sectors with concrete synergy
4. ❌ NEVER suggest generic matches like "they need a website" or "they could use consulting"
5. ❌ NEVER match based on generic "digital services" — match on SPECIFIC capabilities
6. Each reasoning must reference a SPECIFIC capability of the user AND a specific need of the participant
7. Action items must be conference-specific: "At their booth, ask about...", "During the networking session, propose..."
8. Use intelligence signals when available — recent partnerships, funding, product launches create opportunities

Return top 10 matches as JSON array:
[{
  "node_id": "uuid",
  "company_name": "Name",
  "cluster": "Cluster",
  "synergy_type": "existing_relationship|potential_client|potential_partner|investor_match|technology_complement|market_expansion",
  "score": 0.85,
  "reasoning": "SPECIFIC reason referencing both companies' unique capabilities",
  "action_items": ["Concrete conference action 1", "Action 2"],
  "intel_signal": "Recent signal that creates this opportunity (or null)"
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
      existingRelationship: synergyType === "existing_relationship" || existingRelationships.includes(String(r.company_name || "")),
      intelSignal: r.intel_signal ? String(r.intel_signal) : undefined,
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 10);
}

// =============================================================================
// PHASE 4: Research contact info for top matches
// =============================================================================

async function researchContactInfo(
  matches: SynergyMatch[],
  participants: Record<string, unknown>[],
): Promise<void> {
  if (matches.length === 0) return;

  // Build lookup for participant data (link, contact_info from DB)
  const participantMap = new Map<string, Record<string, unknown>>();
  for (const p of participants) {
    participantMap.set(String(p.nombre), p);
  }

  // First, apply any existing contact_info from the database
  for (const match of matches) {
    const p = participantMap.get(match.name);
    if (p) {
      const dbContact = (p.contact_info || {}) as ContactInfo;
      const link = p.link as string | null;
      if (Object.keys(dbContact).length > 0 || link) {
        match.contactInfo = {
          ...dbContact,
          website: dbContact.website || (link && !link.includes("instagram") && !link.includes("twitter") && !link.includes("linkedin") ? link : undefined),
          linkedin: dbContact.linkedin || (link && link.includes("linkedin") ? link : undefined),
          twitter: dbContact.twitter || (link && (link.includes("twitter") || link.includes("x.com")) ? link : undefined),
        };
      }
    }
  }

  // Research contact info for top 5 matches that don't already have email/linkedin
  const needsResearch = matches
    .filter((m) => !m.contactInfo?.email && !m.contactInfo?.linkedin)
    .slice(0, 5);

  if (needsResearch.length === 0) return;

  const companyList = needsResearch.map((m) => {
    const p = participantMap.get(m.name);
    const link = p?.link ? ` (${p.link})` : "";
    return `- ${m.name}${link}`;
  }).join("\n");

  try {
    const content = await callOpenRouter(SONAR_MODEL, [{ role: "user", content:
      `Find REAL business contact information for these companies. I need ways to actually reach them — emails, LinkedIn pages, Twitter/X accounts, contact forms.

Companies:
${companyList}

For EACH company, find:
1. General business email (info@, contact@, hello@, partnerships@, bizdev@)
2. LinkedIn company page URL
3. Twitter/X handle
4. Official website
5. Contact form URL (if they have one)
6. Key contact person for business development (name + title if findable)

IMPORTANT: Only return REAL, verified information. Do NOT make up emails or URLs. If you can't find something, omit it.

Return JSON array:
[{"name": "Company", "email": "real@email.com", "linkedin": "https://linkedin.com/company/x", "twitter": "https://twitter.com/x", "website": "https://...", "contact_form": "https://.../contact", "contact_person": "Name, Title"}]`
    }], 0.1, 1500);

    const results = extractJson(content, true) as Record<string, unknown>[] | null;
    if (!results) return;

    // Map results back to matches
    for (const r of results) {
      const name = String(r.name || "").toLowerCase();
      const match = needsResearch.find((m) => m.name.toLowerCase() === name || name.includes(m.name.toLowerCase()));
      if (match) {
        match.contactInfo = {
          ...(match.contactInfo || {}),
          email: r.email ? String(r.email) : match.contactInfo?.email,
          linkedin: r.linkedin ? String(r.linkedin) : match.contactInfo?.linkedin,
          twitter: r.twitter ? String(r.twitter) : match.contactInfo?.twitter,
          website: r.website ? String(r.website) : match.contactInfo?.website,
          contact_form: r.contact_form ? String(r.contact_form) : match.contactInfo?.contact_form,
          contact_person: r.contact_person ? String(r.contact_person) : match.contactInfo?.contact_person,
        };
      }
    }
  } catch {
    // Contact research is best-effort — don't fail the whole request
  }
}

// =============================================================================
// PHASE 5: Enrich top matches with BD humans + personalized outbound messages
// =============================================================================

// VPS hostname — required because Scrapling needs Playwright + Chromium,
// which won't run in Vercel's serverless runtime. Leave unset locally to
// silently skip this phase.
const OUTBOUND_BACKEND_URL = process.env.OUTBOUND_BACKEND_URL || "";
const OUTBOUND_BACKEND_TIMEOUT_MS = 25_000;

async function enrichWithBDContacts(
  matches: SynergyMatch[],
  attendeeCompany: string,
  attendeeSummary: string,
  eventName: string,
): Promise<void> {
  if (!OUTBOUND_BACKEND_URL || matches.length === 0) return;

  const top = matches.slice(0, 3);

  await Promise.all(
    top.map(async (match) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OUTBOUND_BACKEND_TIMEOUT_MS);

        const res = await fetch(`${OUTBOUND_BACKEND_URL}/api/outbound/bd-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            sponsor_name: match.name,
            sponsor_summary: match.reasoning,
            attendee_company: attendeeCompany,
            attendee_summary: attendeeSummary,
            synergy_reasoning: match.reasoning,
            event_name: eventName,
            max_contacts: 5,
            generate_messages: true,
          }),
        });

        clearTimeout(timer);
        if (!res.ok) return;

        const data = (await res.json()) as {
          people?: BDPerson[];
          messages?: OutboundMessages | null;
        };

        if (data.people?.length) match.bdPeople = data.people;
        if (data.messages) match.outboundMessages = data.messages;
      } catch {
        // Outbound enrichment is best-effort — the VPS may be down, slow,
        // or rate-limited. Never fail the whole opportunities response.
      }
    }),
  );
}

// =============================================================================
// Event metadata
// =============================================================================

const EVENT_META: Record<string, string> = {
  "blockchainrio-2026": "BlockchainRio 2026",
};

// =============================================================================
// Main handler
// =============================================================================

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  if (!OPENROUTER_API_KEY) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

  try {
    const { companyUrl, companyName, goals, specificContext } = (await request.json()) as {
      companyUrl: string; companyName?: string; goals?: string[]; specificContext?: string;
    };
    if (!companyUrl) return NextResponse.json({ error: "companyUrl is required" }, { status: 400 });

    const eventName = EVENT_META[slug] || slug;

    // Phase 1: Deep research (3 parallel Perplexity queries)
    const profile = await deepResearchCompany(companyUrl, companyName);

    // Phase 2: Fetch enriched participants + detect existing relationships
    const { participants, existingRelationships } = await fetchEnrichedParticipants(slug, profile);
    if (participants.length === 0) return NextResponse.json({ error: "No participants found" }, { status: 404 });

    // Phase 3: Score with specificity + intelligence + user goals
    const matches = await scoreSynergies(profile, participants, existingRelationships, eventName, goals, specificContext);

    // Phase 4: Research company-level contact info for top matches (best-effort)
    await researchContactInfo(matches, participants);

    const attendeeName = String(profile.name || companyName || companyUrl);
    const attendeeSummary = `${profile.core_specialization}. Notable projects: ${((profile.notable_projects as string[]) || []).join(", ") || "N/A"}. Known clients: ${((profile.known_clients as string[]) || []).join(", ") || "N/A"}.`;

    // Phase 5: Outbound enrichment — BD humans + personalized messages via VPS
    // (best-effort, skipped in envs without OUTBOUND_BACKEND_URL set).
    await enrichWithBDContacts(matches, attendeeName, attendeeSummary, eventName);

    return NextResponse.json({
      companyName: attendeeName,
      companySummary: attendeeSummary,
      matches,
      existingRelationships,
    });
  } catch (err) {
    console.error("Opportunity matching error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
