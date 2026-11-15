import { expect } from 'vitest';
import { linkSentence as renderLinkSentence } from '../../../shared/messages/test-support/link-sentence.mjs';
import type { FakeCall } from './fixture-types.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../shared/values/readers.mts';

export function enforceableFindings(report: unknown): readonly unknown[] {
  return listOf(report).filter((finding) => fieldOf(finding, 'classification') === 'enforceable');
}

export function enforceableRules(result: {
  readonly json: (name: string) => unknown;
}): unknown[][] {
  return pickFields(enforceableFindings(result.json('new-findings.json')), 'rule', 'symbol');
}

export function pickFields(findings: unknown, ...keys: readonly string[]): unknown[][] {
  return listOf(findings).map((finding) => keys.map((key) => fieldOf(finding, key)));
}

export function labelsOf(findings: unknown, ...keys: readonly string[]): string[] {
  return listOf(findings).map((finding) =>
    keys.map((key) => textOf(fieldOf(finding, key))).join(' '),
  );
}

export function whereField(findings: unknown, key: string, value: unknown): unknown[] {
  return listOf(findings).filter((finding) => fieldOf(finding, key) === value);
}

export function toolNames(summary: unknown): string[] {
  return listOf(fieldOf(summary, 'tools')).map((tool) => textOf(fieldOf(tool, 'name')));
}

export function stringMatching(pattern: RegExp | string): unknown {
  const matcher: unknown = expect.stringMatching(pattern);
  return matcher;
}

export function linkSentence(key: string): string {
  const sentence: string | undefined = renderLinkSentence(key);
  return sentence ?? '';
}

function textField(record: unknown, key: string): string {
  const value = fieldOf(record, key);
  return typeof value === 'string' ? value : '';
}

export function fakeCallOf(record: unknown): FakeCall {
  return {
    tool: textField(record, 'tool'),
    args: textsOf(fieldOf(record, 'args')),
    cwd: textField(record, 'cwd'),
    pythonPath: textField(record, 'pythonPath'),
    seeded: fieldOf(record, 'seeded'),
  };
}
