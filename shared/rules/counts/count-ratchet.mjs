import { withoutExceptionRoute } from '../../messages/exception-sentence.mjs';
import { nameFreeHash } from '../finding-helpers.mjs';

const COUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;

export const REMEDIES = {
  function: 'Put the new code in a new function.',
  nesting: 'Put the new nested code in a new function.',
  class: 'Put the new code in a new class.',
  file: 'Put the new code in a new file.',
  parameters: 'Group related parameters into one object instead of adding another.',
  condition: 'Move the new condition into a named function.',
  coupling: 'Use the new dependency from a new class.',
};

export function countPattern(template, unit, remedy = REMEDIES.function) {
  return { pattern: new RegExp(template.replace('{count}', COUNT), 'du'), unit, remedy };
}

export function countInMessage(message, pattern) {
  const match = pattern.exec(message);
  if (match === null || match.indices === undefined) {
    return undefined;
  }
  const [start, end] = match.indices[1];
  return {
    value: Number(match[1].replaceAll(',', '')),
    subject: `${message.slice(0, start)}#${message.slice(end)}`,
  };
}

function capitalized(text) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function ratchetOf(finding, count, key) {
  const value = String(count.value);
  return {
    key,
    value: count.value,
    worseMessage: `${capitalized(count.unit)} grew from {base} to ${value}. ${count.remedy ?? REMEDIES.function} ${finding.message}`,
    heldMessage: `${withoutExceptionRoute(finding.message)} Allowed at ${value} ${count.unit} because base was {base}; any increase fails.`,
  };
}

export function unitAt(finding, locate) {
  const line = finding.location?.line;
  return line === undefined ? undefined : locate(finding.path, line);
}

function unitKeys(subject, unit) {
  const key = `count:${subject}:in:${unit?.name ?? ''}`;
  return {
    key,
    declarationKey:
      unit?.declarationHash === undefined
        ? undefined
        : `${key}:declaration:${unit.declarationHash}`,
    anchor:
      unit?.anchorHash === undefined
        ? undefined
        : { key: `count:${nameFreeHash(subject, unit.name)}:text:${unit.anchorHash}` },
  };
}

export function withCountRatchets(findings, countOf, unitOf) {
  return findings.map((finding) => {
    const count = finding.ratchet === undefined ? countOf(finding) : undefined;
    if (count === undefined) {
      return finding;
    }
    const unit = unitOf(finding);
    const subject = `${count.unit}:${count.subject.replaceAll(/\bline \d+\b/gu, 'line')}`;
    const { key, declarationKey, anchor } = unitKeys(subject, unit);
    return {
      ...finding,
      identity: `${finding.identity}|in:${unit?.name ?? ''}|value:${String(count.value)}`,
      ratchet: {
        ...ratchetOf(finding, count, key),
        ...(declarationKey === undefined ? {} : { declarationKey }),
      },
      ...(anchor === undefined ? {} : { anchor }),
    };
  });
}
