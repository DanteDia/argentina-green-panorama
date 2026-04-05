-- Migration v3: Contact information for nodes
-- Run this in Supabase SQL Editor AFTER migration_v2.sql

-- Add contact_info JSONB column to store structured contact data
-- Structure: { email, linkedin, twitter, website, phone, contact_form, contact_person }
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_nodes_contact ON nodes USING GIN (contact_info);
