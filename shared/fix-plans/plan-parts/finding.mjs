import { blockEnd, languageOf, linesOf } from './source.mjs';

const LIMIT = /\blimit (?:is |of )?(\d+)|\(limit (\d+)\)/u;
const HAS_VALUE = /\bhas (\d+)\b|\bnests control flow (\d+) deep/u;
const PARAMETERS = /\(.*$/su;

export function limitOf(message) {
  const found = LIMIT.exec(message)?.slice(1).find(Boolean);
  return found === undefined ? undefined : Number(found);
}

export function measuredOf(finding) {
  if (typeof finding.ratchet?.value === 'number') {
    return finding.ratchet.value;
  }
  const found = HAS_VALUE.exec(finding.message)?.slice(1).find(Boolean);
  return found === undefined ? undefined : Number(found);
}

export function symbolOf(finding) {
  return finding.symbol?.replace(PARAMETERS, '');
}

export function targetOf(finding, text) {
  const startLine = finding.location?.line ?? 1;
  const symbol = symbolOf(finding);
  const endLine =
    finding.location?.endLine ??
    (text === undefined ? startLine : blockEnd(linesOf(text), startLine, languageOf(finding.path)));
  return { path: finding.path, ...(symbol === undefined ? {} : { symbol }), startLine, endLine };
}

function placeOf({ path, startLine, endLine }) {
  return endLine === startLine
    ? `${path}:${String(startLine)}`
    : `${path}:${String(startLine)}-${String(endLine)}`;
}

export function describe(target) {
  return target.symbol === undefined ? placeOf(target) : `${target.symbol} (${placeOf(target)})`;
}

export function without(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function allowedFormOf(finding, fallback) {
  return finding.allowedForm ?? fallback;
}
