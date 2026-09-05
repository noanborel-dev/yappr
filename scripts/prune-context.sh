#!/usr/bin/env bash
# Prune remembered rules that are ABOUT YAPPR rather than about the user.
#
# The compactor mines durable preferences from dictations. When the
# dictations are bug reports — which they are, constantly, while building
# the thing — it stores "I always want prompts to include both context and
# constraints" as a standing preference about how the user works.
#
# Those rules are worse than useless. capForInjection takes newest-first,
# so a week of debugging notes fills the 600-character budget while
# "I want fluid animations in interfaces" sits below the cut and never
# reaches a prompt.
#
# src/main/context/project-facts.ts now instructs the miner to reject
# them, but that only affects future compactions. This clears what is
# already stored.
#
#   ./scripts/prune-context.sh          # dry run, shows what would go
#   ./scripts/prune-context.sh --apply  # back up, then delete
#
# Measured on the store as it stood 2026-09-05: 44 global rules in, 22
# meta-statements out, 22 real preferences kept. Every deletion was read
# by hand against that snapshot before this list was fixed.
set -euo pipefail

DB="$HOME/Library/Application Support/yappr/context.db"
[ -f "$DB" ] || { echo "no context.db at $DB"; exit 1; }

# Meta-statements: rules about prompts, remembered rules, context
# handling, contradiction resolution, and output formatting. Deliberately
# narrow — "animation", "colour", "mobile" and the rest are untouched.
WHERE="scope='global' AND (
     lower(text) LIKE '%prompt%'
  OR lower(text) LIKE '%remembered rule%'
  OR lower(text) LIKE '%context and constraint%'
  OR lower(text) LIKE '%relevant context%'
  OR lower(text) LIKE '%most recent version%'
  OR lower(text) LIKE '%most recent statement%'
  OR lower(text) LIKE '%contradiction%'
  OR lower(text) LIKE '%global store%'
  OR lower(text) LIKE '%per project%'
  OR lower(text) LIKE '%appending duplicate%'
  OR lower(text) LIKE '%output formatted%'
  OR lower(text) LIKE '%negative action%'
  OR lower(text) LIKE '%the system%'
  OR lower(text) LIKE '%automatically include%'
)"

echo "=== would delete ==="
sqlite3 "$DB" "SELECT '  '||id||'  '||text FROM context_facts WHERE $WHERE ORDER BY created_at DESC;"
echo
echo "=== would keep (global) ==="
sqlite3 "$DB" "SELECT '  '||id||'  '||text FROM context_facts WHERE scope='global' AND NOT ($WHERE) ORDER BY created_at DESC;"
echo

if [ "${1:-}" != "--apply" ]; then
  echo "Dry run. Re-run with --apply to delete."
  exit 0
fi

# Yappr must not be running.
#
# Two separate reasons, both real. The store keeps an in-process cache of
# every bucket (the Map in src/main/context/facts.ts) and only drops it on
# a write THROUGH the app, so rows deleted underneath it keep reaching
# prompts until the next restart — you would delete them and see no
# change. And the app holds the database open in WAL mode, so a write
# from a second connection lands in a journal the running process is also
# appending to.
if command -v lsof >/dev/null 2>&1 && lsof "$DB" >/dev/null 2>&1; then
  echo "Yappr has $DB open. Quit it first (Cmd-Q, or stop electron-vite dev),"
  echo "then re-run. Deleting underneath the running app would not take"
  echo "effect until a restart anyway — the fact cache is in-process."
  exit 1
fi

# Back up with sqlite's own .backup, NOT cp.
#
# The database is WAL-mode, and the write-ahead log routinely holds more
# than the main file does — 210KB of -wal against 57KB of context.db when
# this was written. `cp context.db` captures the smaller half and silently
# loses the rest, and restoring that file next to a live -wal is worse
# than having no backup at all. .backup checkpoints and writes one
# consistent file.
BACKUP="$HOME/Desktop/context-backup-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB" ".backup '$BACKUP'"
echo "backup: $BACKUP  ($(wc -c < "$BACKUP" | tr -d ' ') bytes)"
echo "  restore with:  cp '$BACKUP' '$DB' && rm -f '$DB-wal' '$DB-shm'"

sqlite3 "$DB" "DELETE FROM context_facts WHERE $WHERE;"
echo
echo "=== after ==="
sqlite3 "$DB" "SELECT '  '||scope||' '||COALESCE(NULLIF(project_key,''),'-')||': '||COUNT(*)||' rules, '||SUM(LENGTH(text))||' chars' FROM context_facts GROUP BY scope, project_key;"
echo
echo "Restart Yappr, then Settings -> AI -> refresh to regenerate the overview."
