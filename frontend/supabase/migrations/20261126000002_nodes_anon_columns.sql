-- Close the map's raw data to the API keys a browser holds. Every page reads nodes and edges on the server (service
-- role) or with a signed-in artist's client; nothing reads them with the public key. So:
-- - the public key reads neither table: raw Instagram bios, collectors and who bought whose work stay server-side,
--   and the public pages show only what /arte/escena redacts and filters;
-- - a signed-in artist reads every column of nodes except contact_info and extra (emails, phones, handles), which
--   only server code reads (lib/arte/graph-match.ts and the follows import use the admin client).
-- Re-runnable; the column list is read from the table, so it works whatever columns a database has.
revoke select on nodes, edges from anon;
revoke select on nodes from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'nodes' and column_name not in ('contact_info', 'extra');
  execute format('grant select (%s) on nodes to authenticated', cols);
end $$;
