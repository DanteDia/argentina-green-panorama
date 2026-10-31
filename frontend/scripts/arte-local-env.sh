#!/usr/bin/env bash
# Exports the local Supabase connection (from `supabase status`) for dev and tests, so no keys live in files.
# Usage: source scripts/arte-local-env.sh   (or: scripts/arte-local-env.sh <command...>)
_st=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && supabase status -o env 2>/dev/null)
_get() { printf '%s\n' "$_st" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
export NEXT_PUBLIC_SUPABASE_URL="$(_get API_URL)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(_get ANON_KEY)"
export SUPABASE_SERVICE_ROLE_KEY="$(_get SERVICE_ROLE_KEY)"
export ARTE_DATABASE_URL="$(_get DB_URL)"
export ARTE_MAILPIT_URL="$(_get INBUCKET_URL)"
# Instagram data (HikerAPI): key kept in the macOS Keychain, never in files
export HIKERAPI_KEY="${HIKERAPI_KEY:-$(security find-generic-password -s hikerapi -a escena-arte -w 2>/dev/null)}"
if [ "${BASH_SOURCE[0]}" = "$0" ] && [ $# -gt 0 ]; then exec "$@"; fi
