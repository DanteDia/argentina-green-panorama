-- Migration v2: EventsVerified + Multi-Map Support
-- Run this in Supabase SQL Editor AFTER the initial schema.sql

-- ============================================================
-- 1. Fix missing columns on existing tables
-- ============================================================

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS discovery_method TEXT DEFAULT 'manual';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS region TEXT;

ALTER TABLE edges ADD COLUMN IF NOT EXISTS discovery_method TEXT DEFAULT 'manual';

-- Backfill existing Green Panorama nodes
UPDATE nodes SET industry = 'green', region = 'argentina'
WHERE industry IS NULL;

-- ============================================================
-- 2. Maps table (named filter presets / event definitions)
-- ============================================================

CREATE TABLE IF NOT EXISTS maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  map_type TEXT DEFAULT 'industry',
  description TEXT,
  filter_industry TEXT,
  filter_region TEXT,
  filter_event TEXT,
  event_start DATE,
  event_end DATE,
  event_location TEXT,
  event_website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed existing Green Panorama as a map
INSERT INTO maps (slug, name, map_type, filter_industry, filter_region)
VALUES ('green-argentina', 'Green Panorama Argentina', 'industry', 'green', 'argentina')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. Event participants (event-specific metadata per company)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug TEXT NOT NULL,
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  role TEXT,
  sponsor_tier TEXT,
  speaking_track TEXT,
  booth_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_slug, node_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_slug);
CREATE INDEX IF NOT EXISTS idx_event_participants_node ON event_participants(node_id);

-- ============================================================
-- 4. Node intelligence (deep research signals)
-- ============================================================

CREATE TABLE IF NOT EXISTS node_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  intel_type TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  url TEXT,
  author TEXT,
  engagement_score INTEGER,
  detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_node ON node_intelligence(node_id);
CREATE INDEX IF NOT EXISTS idx_intel_type ON node_intelligence(intel_type);
CREATE INDEX IF NOT EXISTS idx_intel_source ON node_intelligence(source);

-- ============================================================
-- 5. Synergies (opportunity matching)
-- ============================================================

CREATE TABLE IF NOT EXISTS synergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_a_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  node_b_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  event_slug TEXT,
  synergy_type TEXT NOT NULL,
  score FLOAT DEFAULT 0.5,
  reasoning TEXT NOT NULL,
  action_items TEXT[],
  evidence_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_a_id, node_b_id, event_slug, synergy_type)
);

CREATE INDEX IF NOT EXISTS idx_synergies_event ON synergies(event_slug);
CREATE INDEX IF NOT EXISTS idx_synergies_node_a ON synergies(node_a_id);
CREATE INDEX IF NOT EXISTS idx_synergies_score ON synergies(score DESC);

-- ============================================================
-- 6. Additional indexes on nodes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_nodes_industry ON nodes(industry);
CREATE INDEX IF NOT EXISTS idx_nodes_region ON nodes(region);
CREATE INDEX IF NOT EXISTS idx_nodes_depth ON nodes(depth);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at DESC);

-- ============================================================
-- 7. RLS policies for new tables
-- ============================================================

ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE synergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read maps" ON maps FOR SELECT USING (true);
CREATE POLICY "Service role full maps" ON maps FOR ALL USING (true);

CREATE POLICY "Public read event_participants" ON event_participants FOR SELECT USING (true);
CREATE POLICY "Service role full event_participants" ON event_participants FOR ALL USING (true);

CREATE POLICY "Public read node_intelligence" ON node_intelligence FOR SELECT USING (true);
CREATE POLICY "Service role full node_intelligence" ON node_intelligence FOR ALL USING (true);

CREATE POLICY "Public read synergies" ON synergies FOR SELECT USING (true);
CREATE POLICY "Service role full synergies" ON synergies FOR ALL USING (true);

-- ============================================================
-- 8. Insert BlockchainRio 2025 event map
-- ============================================================

INSERT INTO maps (slug, name, map_type, description, filter_industry, filter_region, filter_event,
                  event_start, event_end, event_location, event_website)
VALUES (
  'blockchainrio-2026',
  'BlockchainRio 2026',
  'event',
  'Latin America''s largest blockchain conference — 20,000+ attendees, 400+ speakers, 70+ sponsors',
  'blockchain',
  'brazil',
  'blockchainrio-2026',
  '2026-08-05',
  '2026-08-07',
  'Rio de Janeiro, Brazil',
  'https://blockchainrio.com.br'
) ON CONFLICT (slug) DO NOTHING;
