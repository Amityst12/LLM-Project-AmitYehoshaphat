/**
 * scripts/check-secrets.mjs
 * Cross-platform pre-commit secret scanner.
 * Scans staged files for common API key / token patterns.
 * Exits with code 1 if secrets are detected → blocks the commit.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_PATTERNS = [
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'GitHub PAT', regex: /ghp_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub App Token', regex: /ghs_[A-Za-z0-9]{36,}/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Slack Token', regex: /xox[bpors]-[A-Za-z0-9\-]+/ },
  { name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-_.~+/]{20,}/ },
];

try {
  const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  let found = false;

  for (const file of stagedFiles) {
    // Skip binary files and the check-secrets script itself
    if (file === 'scripts/check-secrets.mjs' || file === 'scripts/check-secrets.sh') continue;
    if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.ico')) continue;

    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue; // skip files that can't be read
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(lines[i])) {
          console.error(`\x1b[31m[SECRET DETECTED]\x1b[0m ${pattern.name} in ${file}:${i + 1}`);
          console.error(`  ${lines[i].trim().substring(0, 80)}...`);
          found = true;
        }
      }
    }
  }

  if (found) {
    console.error('');
    console.error('\x1b[31mCOMMIT BLOCKED:\x1b[0m Potential secrets found in staged files.');
    console.error('Remove the secrets and use .env for sensitive values.');
    process.exit(1);
  }

  console.log('[check-secrets] No secrets detected.');
  process.exit(0);
} catch (error) {
  console.error('[check-secrets] Warning: could not scan for secrets:', error.message);
  // Don't block commits if the scanner itself fails
  process.exit(0);
}
