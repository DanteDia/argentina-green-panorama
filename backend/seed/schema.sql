-- Green Panorama Supabase Schema
-- Run this in the Supabase SQL Editor

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  link TEXT,
  followers INTEGER,
  cluster TEXT NOT NULL,
  categoria TEXT,
  quien_fondea TEXT,
  aliados_portfolio TEXT[] DEFAULT '{}',
  clientes TEXT[] DEFAULT '{}',
  descripcion TEXT,
  logo_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verification_tx TEXT,
  verification_date TIMESTAMPTZ,
  verification_attempts INTEGER DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified',  -- unverified, pending, verified, failed, grey
  verification_failure_reason TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edges table
CREATE TABLE IF NOT EXISTS edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  target_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  description TEXT,
  confidence FLOAT DEFAULT 1.0,
  source TEXT DEFAULT 'manual',
  verified BOOLEAN DEFAULT FALSE,
  verification_tx TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent runs log
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  nodes_added INTEGER DEFAULT 0,
  edges_added INTEGER DEFAULT 0,
  log JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Health monitor snapshots
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_cluster ON nodes(cluster);
CREATE INDEX IF NOT EXISTS idx_nodes_verified ON nodes(verified);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(relationship_type);

-- Enable Row Level Security (optional - for public read access)
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read access for nodes" ON nodes FOR SELECT USING (true);
CREATE POLICY "Public read access for edges" ON edges FOR SELECT USING (true);
CREATE POLICY "Public read access for agent_runs" ON agent_runs FOR SELECT USING (true);

-- Allow service role full access
CREATE POLICY "Service role full access nodes" ON nodes FOR ALL USING (true);
CREATE POLICY "Service role full access edges" ON edges FOR ALL USING (true);
CREATE POLICY "Service role full access agent_runs" ON agent_runs FOR ALL USING (true);

ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for health_snapshots" ON health_snapshots FOR SELECT USING (true);
CREATE POLICY "Service role full access health_snapshots" ON health_snapshots FOR ALL USING (true);
