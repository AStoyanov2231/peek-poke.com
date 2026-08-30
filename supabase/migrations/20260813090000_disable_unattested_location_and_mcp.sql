-- Client-reported coordinates are not proof of physical presence. Clear the
-- untrusted data and remove the RPCs that could use it until attestation is
-- introduced. MCP support is intentionally dropped in this release.
delete from public.user_locations;

drop function if exists public.nearby_users_for_user(uuid, double precision);
drop function if exists public.mcp_nearby_users(double precision, double precision, double precision);
