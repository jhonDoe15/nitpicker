import { existsSync, readFileSync } from 'node:fs';
import {
  blankLiterals,
  expressionAt,
  offsetOf,
  pathInside,
} from '../adapters/review-rules/java-sources.mjs';

export const LOAD_EFFECT_RULE = 'ClassLoadEffect';
const SUBJECT = 'this call runs while';
const MAX_CALL_LENGTH = 100;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

function collapsedArguments(expression) {
  let depth = 0;
  let text = '';
  for (const character of expression) {
    if (CLOSERS.has(character)) {
      depth -= 1;
    }
    if (depth === 0) {
      text += character;
    } else if (!text.endsWith('...')) {
      text += '...';
    }
    if (OPENERS.has(character)) {
      depth += 1;
    }
  }
  return text;
}

export function shortCall(text) {
  const call = collapsedArguments(text.trim()).replaceAll(/\s+/gu, ' ');
  return call.length > MAX_CALL_LENGTH ? `${call.slice(0, MAX_CALL_LENGTH)}...` : call;
}

export function callText(source, location) {
  const start = offsetOf(source, location);
  const extent = expressionAt(blankLiterals(source), start).trimEnd().length;
  return shortCall(source.slice(start, start + extent));
}

function sourceOf(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function named(finding, projectRoot) {
  const source = projectRoot === undefined ? undefined : sourceOf(projectRoot, finding.path);
  if (source === undefined || finding.location === undefined) {
    return finding;
  }
  const call = callText(source, finding.location);
  return call === ''
    ? finding
    : { ...finding, message: finding.message.replace(SUBJECT, `\`${call}\` runs while`) };
}

export function withLoadEffectCalls(findings, { projectRoot }) {
  return findings.map((finding) =>
    finding.tool === 'pmd' && finding.rule === LOAD_EFFECT_RULE && finding.path.endsWith('.java')
      ? named(finding, projectRoot)
      : finding,
  );
}
