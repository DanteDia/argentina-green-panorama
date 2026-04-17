-- Industries tagging — one node, many industries.
-- Run once in Supabase SQL Editor. Idempotent.
--
-- Why: the `nodes` table is the shared graph across multiple industry
-- maps (green, blockchain, fintech, …). The existing singular `industry`
-- column is authoritative but can only hold one value, and a single
-- company can belong to multiple sectors (e.g. a crypto-native green fund).
-- This adds `industries TEXT[]` and backfills from `industry`.
--
-- After this runs:
--   - Every node has `industries` (defaults to ['green'] for new inserts).
--   - `industry` (singular) stays as-is; writes to it by existing code keep working.
--   - The /api/graph endpoint filters via `?industries=green` using
--     array overlap, powered by the GIN index below.

BEGIN;

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS industries TEXT[] NOT NULL DEFAULT ARRAY['green']::TEXT[];

CREATE INDEX IF NOT EXISTS idx_nodes_industries_gin
  ON nodes USING GIN (industries);

-- Backfill from the existing singular `industry` column.
-- The 520 'green' + 51 'blockchain' rows get migrated directly;
-- the 24 NULL rows (early seed, pre-dates BlockchainRio) default to ['green'].
UPDATE nodes
  SET industries = CASE
    WHEN industry IS NOT NULL AND industry <> '' THEN ARRAY[industry]::TEXT[]
    ELSE ARRAY['green']::TEXT[]
  END;

-- Sanity-check after COMMIT:
--   SELECT unnest(industries) AS industry, count(*)
--   FROM nodes GROUP BY 1 ORDER BY 2 DESC;
-- Expected:
--   green       ~544
--   blockchain   ~51

COMMIT;
