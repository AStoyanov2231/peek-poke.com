-- Correct the approved baseline account-erasure function without replacing its
-- preserved definition, owner, or grants wholesale.
do $migration$
declare
  v_definition text;
  v_corrected_definition text;
  v_after_definition text;
  v_owner oid;
  v_after_owner oid;
  v_acl pg_catalog.aclitem[];
  v_after_acl pg_catalog.aclitem[];
  v_security_definer boolean;
  v_after_security_definer boolean;
  v_config text[];
  v_after_config text[];
  v_read_at_expression constant text := 'pg_catalog.coalesce(message.read_at, pg_catalog.now())';
  v_content_expression constant text := 'pg_catalog.coalesce(message.content, '''')';
  v_expected_hash constant text := 'e5440d1e91f6d1ba707b4b33261848e2f165cb748f2e79d9b46081e4d4e949cc';
begin
  select pg_catalog.pg_get_functiondef(proc.oid),
         proc.proowner,
         proc.proacl,
         proc.prosecdef,
         proc.proconfig
    into v_definition, v_owner, v_acl, v_security_definer, v_config
    from pg_catalog.pg_proc proc
   where proc.oid = 'public.erase_account_data(uuid)'::pg_catalog.regprocedure;

  if v_definition is null then
    raise exception 'public.erase_account_data(uuid) is required';
  end if;

  if pg_catalog.encode(
       extensions.digest(pg_catalog.convert_to(v_definition, 'UTF8'), 'sha256'),
       'hex'
     ) <> v_expected_hash then
    raise exception 'public.erase_account_data(uuid) definition hash does not match the approved pre-correction version';
  end if;

  if pg_catalog.strpos(v_definition, v_read_at_expression) = 0
     or pg_catalog.strpos(v_definition, v_content_expression) = 0 then
    raise exception 'approved account-erasure coalesce expressions are missing';
  end if;

  v_corrected_definition := pg_catalog.replace(
    pg_catalog.replace(
      v_definition,
      v_read_at_expression,
      'coalesce(message.read_at, pg_catalog.now())'
    ),
    v_content_expression,
    'coalesce(message.content, '''')'
  );

  execute v_corrected_definition;

  select pg_catalog.pg_get_functiondef(proc.oid),
         proc.proowner,
         proc.proacl,
         proc.prosecdef,
         proc.proconfig
    into v_after_definition, v_after_owner, v_after_acl,
         v_after_security_definer, v_after_config
    from pg_catalog.pg_proc proc
   where proc.oid = 'public.erase_account_data(uuid)'::pg_catalog.regprocedure;

  if pg_catalog.strpos(v_after_definition, v_read_at_expression) <> 0
     or pg_catalog.strpos(v_after_definition, v_content_expression) <> 0
     or pg_catalog.strpos(v_after_definition, 'coalesce(message.read_at, pg_catalog.now())') = 0
     or pg_catalog.strpos(v_after_definition, 'coalesce(message.content, '''')') = 0 then
    raise exception 'account-erasure coalesce correction was not applied exactly';
  end if;

  if v_after_owner is distinct from v_owner
     or v_after_acl is distinct from v_acl
     or v_after_security_definer is distinct from v_security_definer
     or v_after_config is distinct from v_config then
    raise exception 'account-erasure function owner, ACL, security-definer mode, or configuration changed';
  end if;

  if v_after_security_definer is not true
     or not exists (
       select 1
         from pg_catalog.unnest(v_after_config) setting
        where pg_catalog.split_part(setting, '=', 1) = 'search_path'
          and pg_catalog.split_part(setting, '=', 2) in ('', '""')
     ) then
    raise exception 'account-erasure function must remain SECURITY DEFINER with an empty search_path';
  end if;
end;
$migration$;
