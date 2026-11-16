import { expect } from 'vitest';
import { linkSentence as untypedLinkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import type { Finding, GateResult, Sarif } from './python-e2e-types.mts';
import { summarize } from './python-e2e-support.mts';

export function enforceable(result: Pick<GateResult, 'json'>): string[] {
  return summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }: Finding) => classification === 'enforceable'),
  );
}

export function withoutMutants(summaries: readonly string[]): string[] {
  return summaries.filter((summary) => !summary.startsWith('mutmut '));
}

function isCountLine(row: string): boolean {
  return row.startsWith('  by area: ') || row.startsWith('  by label: ');
}

export function reportedGroups(text: string): string[][] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('✖ '));
  const section = lines.slice(start + 1);
  const end = section.findIndex((line) => !line.startsWith('  '));
  const groups: string[][] = [];
  for (const line of section.slice(0, end).filter((row) => !isCountLine(row))) {
    if (line.startsWith('    ')) {
      groups.at(-1)?.push(line.trim());
    } else {
      groups.push([line.trim()]);
    }
  }
  return groups.filter(([label]) => !label?.startsWith('mutmut/'));
}

export function pythonExceptionRoute(rule: string, file: string): string {
  return (
    `If this is intended, add {"rule":"${rule}","paths":["${file}"],"reason":"..."} ` +
    'to "python.exceptions" in nitpicker.config.json.'
  );
}

export const GATE_PACKAGES = ['coverage', 'mutmut', 'pytest', 'mypy'];

export const parseSarif: (text: string) => Sarif = JSON.parse;

export function anyString(): unknown {
  const matcher: unknown = expect.any(String);
  return matcher;
}

export function stringMatching(pattern: RegExp): unknown {
  const matcher: unknown = expect.stringMatching(pattern);
  return matcher;
}

export function linkSentence(key: string): string {
  const sentence = untypedLinkSentence(key);
  if (sentence === undefined) {
    throw new Error(`No troubleshooting sentence for ${key}`);
  }
  return sentence;
}
