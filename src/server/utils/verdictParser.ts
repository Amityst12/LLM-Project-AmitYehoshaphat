import { VerdictDecision } from '../types/tribunal.js';

export interface ParsedVerdictData {
  verdict: VerdictDecision;
  reasoning: string;
  dissentPoints: string[];
}

/**
 * Normalizes loose verdict strings into the strictly typed VerdictDecision enum.
 */
export function normalizeVerdictDecision(rawVerdict: unknown): VerdictDecision {
  if (typeof rawVerdict !== 'string') {
    return 'undecided';
  }

  const normalized = rawVerdict.toLowerCase().trim().replace(/[-\s]+/g, '_');

  if (
    normalized === 'not_guilty' ||
    normalized === 'innocent' ||
    normalized === 'acquitted' ||
    normalized === 'not_liable' ||
    normalized === 'no_liability'
  ) {
    return 'not_guilty';
  }

  if (
    normalized === 'guilty' ||
    normalized === 'liable' ||
    normalized === 'culpable' ||
    normalized === 'convicted'
  ) {
    return 'guilty';
  }

  return 'undecided';
}

/**
 * Robust parser for LLM judge output (Mitigation P1).
 * Attempts multiple JSON extraction strategies before safely falling back to regex.
 */
export function parseJudgeVerdict(rawText: string): ParsedVerdictData {
  const trimmed = (rawText || '').trim();

  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return extractStructuredFields(parsed, trimmed);
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract from markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim()) as Record<string, unknown>;
      return extractStructuredFields(parsed, trimmed);
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Find first balanced or substring JSON object { ... }
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]) as Record<string, unknown>;
      return extractStructuredFields(parsed, trimmed);
    } catch {
      // Continue to fallback
    }
  }

  // Strategy 4: Fallback Regex extraction for freeform text (Mitigation P1)
  return fallbackRegexParser(trimmed);
}

function extractStructuredFields(
  obj: Record<string, unknown>,
  originalText: string,
): ParsedVerdictData {
  const rawVerdict = obj.verdict ?? obj.decision ?? obj.ruling;
  const verdict = normalizeVerdictDecision(rawVerdict);

  const rawReasoning = obj.reasoning ?? obj.explanation ?? obj.rationale ?? originalText;
  const reasoning = typeof rawReasoning === 'string' ? rawReasoning.trim() : originalText;

  const rawDissent = obj.dissent_points ?? obj.dissentPoints ?? obj.dissents ?? [];
  let dissentPoints: string[] = [];

  if (Array.isArray(rawDissent)) {
    dissentPoints = rawDissent
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (typeof rawDissent === 'string' && rawDissent.trim()) {
    dissentPoints = [rawDissent.trim()];
  }

  return {
    verdict,
    reasoning,
    dissentPoints,
  };
}

function fallbackRegexParser(text: string): ParsedVerdictData {
  let verdict: VerdictDecision = 'undecided';

  // Check for explicit not guilty / innocent first to prevent false positive on "guilty"
  if (/\b(not[_\s-]?guilty|innocent|acquitted|no[_\s-]?liability|not[_\s-]?liable)\b/i.test(text)) {
    verdict = 'not_guilty';
  } else if (/\b(guilty|liable|culpable|convicted)\b/i.test(text)) {
    verdict = 'guilty';
  }

  // Extract bullet points as dissent points if present
  const bulletLines = text
    .split('\n')
    .filter((line) => /^\s*[-*•\d.]+\s+/.test(line))
    .map((line) => line.replace(/^\s*[-*•\d.]+\s+/, '').trim())
    .filter(Boolean);

  return {
    verdict,
    reasoning: text || 'No reasoning provided',
    dissentPoints: bulletLines,
  };
}
