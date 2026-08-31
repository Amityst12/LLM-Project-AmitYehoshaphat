#!/usr/bin/env bash
# ==================================================
# scripts/check-secrets.sh
# Pre-commit secret scanner — blocks commits that
# contain likely API keys or tokens.
# ==================================================

set -euo pipefail

RED='\033[0;31m'
NC='\033[0m'

# Patterns that should never appear in committed code
SECRET_PATTERNS=(
  'sk-[A-Za-z0-9]{20,}'          # OpenAI keys
  'ghp_[A-Za-z0-9]{36,}'         # GitHub PATs
  'ghs_[A-Za-z0-9]{36,}'         # GitHub App tokens
  'AKIA[0-9A-Z]{16}'             # AWS Access Keys
  'AIza[0-9A-Za-z\-_]{35}'       # Google API keys
  'xox[bpors]-[A-Za-z0-9\-]+'    # Slack tokens
  'Bearer [A-Za-z0-9\-_.~+/]+'   # Bearer tokens
)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

FOUND=0

for pattern in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(echo "$STAGED_FILES" | xargs grep -nEI "$pattern" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo -e "${RED}[SECRET DETECTED]${NC} Pattern: $pattern"
    echo "$MATCHES"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo ""
  echo -e "${RED}COMMIT BLOCKED:${NC} Potential secrets found in staged files."
  echo "Remove the secrets and use .env for sensitive values."
  exit 1
fi

echo "[check-secrets] No secrets detected."
exit 0