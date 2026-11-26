-- The public key could read every column of nodes, contact_info included (emails, phones, Instagram handles of
-- people in the art map). Every reader in the app goes through the server (service role or a signed-in user), so the
-- public key keeps only the columns a public map shows. Re-runnable.
revoke select on nodes from anon;
grant select (id, nombre, link, followers, cluster, categoria, quien_fondea, aliados_portfolio, clientes, descripcion,
  logo_url, verified, verification_tx, verification_date, source, created_at, updated_at, verification_attempts,
  verification_status, verification_failure_reason, depth, discovery_method, discovered_by, verification_details,
  industry, region, industries, external_id) on nodes to anon;
