import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { appendAll } from '../../../../../shared/lists/items.mjs';
import type { DepthChanges } from '../review-types.mts';

export type SwitchLabels = string[][];
type SwitchEntry = {
  readonly labels: string | undefined;
  readonly start: number;
  readonly end: number;
};

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const SWITCH_LABEL = /\b(?:case\b([^:-]*)|default\s*)(?:->|:)/gu;
const DEFAULT_LABEL = /\bdefault\b/u;
const IDENTIFIER_ONLY = /^[A-Za-z_$][\w$]*$/u;
const DECLARED_TYPE = String.raw`(?<![\w$.])([A-Z][\w$]*)(?:<[^<>;]*>)?\s+`;
const BRACE_DEPTH: DepthChanges = { '{': 1, '}': -1 };

export function switchBody(text: string, start: number): string {
  const open = text.indexOf('{', start);
  const body = open < 0 ? '' : text.slice(open + 1);
  let depth = 1;
  let end = 0;
  for (const character of body) {
    depth += BRACE_DEPTH[character] ?? 0;
    if (depth === 0) {
      return body.slice(0, end);
    }
    end += character.length;
  }
  return '';
}

function switchEntries(body: string): SwitchEntry[] {
  return [...body.matchAll(SWITCH_LABEL)].map((match) => ({
    labels: match[1],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function listedLabels(body: string): SwitchLabels {
  const entries = switchEntries(body);
  const listed: string[] = [];
  let intoDefault = false;
  for (const [index, entry] of [...entries.entries()].reverse()) {
    const next = entries[index + 1];
    const fallsThrough = next !== undefined && body.slice(entry.end, next.start).trim() === '';
    const isDefault = entry.labels === undefined || DEFAULT_LABEL.test(entry.labels);
    intoDefault = isDefault || (fallsThrough && intoDefault);
    appendAll(listed, intoDefault ? [] : (entry.labels ?? '').split(','));
  }
  return listed
    .map((label) => label.split('.').map((part) => part.trim()))
    .filter((parts) => parts.join('.') !== 'null');
}

export function declaredTypes(text: string, subject: string): string[] | undefined {
  if (!IDENTIFIER_ONLY.test(subject)) {
    return undefined;
  }
  const declaration = new RegExp(
    String.raw`${DECLARED_TYPE}${escapeRegExp(subject)}(?![\w$])\s*[,)=;:]`,
    'gu',
  );
  const types = new Set([...text.matchAll(declaration)].map(([, type = '']) => type));
  return types.size === 1 ? [...types] : undefined;
}
