-- READ-ONLY report of what the website's database role can ACTUALLY do (effective privileges, including anything inherited from PUBLIC or
-- other roles). Changes nothing. Owner-run after applying website-runtime-role-grants.sql, and again after every CRM migration:
--
--     psql "$OWNER_URL" -v ON_ERROR_STOP=1 -v role=bft_web -f deploy/sql/verify-website-runtime-role.sql
--
-- Compare the output with the "Expected result" table in docs/DEPLOYMENT_VPS.md (section 6.2). scripts/verify-runtime-role-pg.ts runs this
-- exact file against a real PostgreSQL server and fails if the result differs. Any extra line = a privilege the website must not have.
-- A table/sequence the CRM added after the grants were written does not appear here until the owner grants it deliberately.

SELECT object, kind, privileges FROM (
  -- table-level privileges (the table's own columns, present and future)
  SELECT c.relname::text AS object, 'table' AS kind,
         concat_ws(',',
           CASE WHEN has_table_privilege(:'role', c.oid, 'SELECT')     THEN 'SELECT' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'INSERT')     THEN 'INSERT' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'UPDATE')     THEN 'UPDATE' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'DELETE')     THEN 'DELETE' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'TRUNCATE')   THEN 'TRUNCATE' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'REFERENCES') THEN 'REFERENCES' END,
           CASE WHEN has_table_privilege(:'role', c.oid, 'TRIGGER')    THEN 'TRIGGER' END) AS privileges
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND CASE WHEN c.relkind IN ('r', 'p') AND n.nspname = 'public' THEN has_table_privilege(:'role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END
  UNION ALL
  -- column-level SELECT on tables the role cannot read as a whole
  SELECT c.relname::text, 'columns', string_agg(a.attname::text, ',' ORDER BY a.attnum)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT has_table_privilege(:'role', c.oid, 'SELECT')
    AND (has_column_privilege(:'role', c.oid, a.attnum, 'SELECT')
      OR has_column_privilege(:'role', c.oid, a.attnum, 'INSERT')
      OR has_column_privilege(:'role', c.oid, a.attnum, 'UPDATE'))
  GROUP BY c.relname
  UNION ALL
  -- column-level UPDATE / INSERT on tables where the role has no such privilege on the table as a whole
  SELECT c.relname::text, 'column-update', string_agg(a.attname::text, ',' ORDER BY a.attnum)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT has_table_privilege(:'role', c.oid, 'UPDATE')
    AND has_column_privilege(:'role', c.oid, a.attnum, 'UPDATE')
  GROUP BY c.relname
  UNION ALL
  SELECT c.relname::text, 'sequence',
         concat_ws(',',
           CASE WHEN has_sequence_privilege(:'role', c.oid, 'USAGE')  THEN 'USAGE' END,
           CASE WHEN has_sequence_privilege(:'role', c.oid, 'SELECT') THEN 'SELECT' END,
           CASE WHEN has_sequence_privilege(:'role', c.oid, 'UPDATE') THEN 'UPDATE' END)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
    -- CASE: PostgreSQL may evaluate the privilege function before the filters above, and it raises an error on a non-sequence relation
    AND CASE WHEN c.relkind = 'S' AND n.nspname = 'public' THEN has_sequence_privilege(:'role', c.oid, 'USAGE,SELECT,UPDATE') ELSE false END
  UNION ALL
  SELECT 'public', 'schema',
         concat_ws(',',
           CASE WHEN has_schema_privilege(:'role', 'public', 'USAGE')  THEN 'USAGE' END,
           CASE WHEN has_schema_privilege(:'role', 'public', 'CREATE') THEN 'CREATE' END)
  UNION ALL
  SELECT current_database()::text, 'database',
         concat_ws(',',
           CASE WHEN has_database_privilege(:'role', current_database(), 'CONNECT')   THEN 'CONNECT' END,
           CASE WHEN has_database_privilege(:'role', current_database(), 'CREATE')    THEN 'CREATE' END,
           CASE WHEN has_database_privilege(:'role', current_database(), 'TEMPORARY') THEN 'TEMPORARY' END)
  UNION ALL
  SELECT rolname::text, 'role-attributes',
         concat_ws(',',
           CASE WHEN rolsuper       THEN 'SUPERUSER' END,
           CASE WHEN rolcreatedb    THEN 'CREATEDB' END,
           CASE WHEN rolcreaterole  THEN 'CREATEROLE' END,
           CASE WHEN rolreplication THEN 'REPLICATION' END,
           CASE WHEN rolbypassrls   THEN 'BYPASSRLS' END,
           CASE WHEN rolcanlogin    THEN 'LOGIN' END)
  FROM pg_roles WHERE rolname = :'role'
) report
ORDER BY kind, object;
