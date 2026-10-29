import { expect } from 'vitest';
import { expectMatchesSarifSchema } from './sarif-schema.mjs';

const SARIF_LEVELS = new Set(['none', 'note', 'warning', 'error']);
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos);/gu;
const XML_TOKEN =
  /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>|([^<]+)|(<)/gu;

function expectPositiveInteger(value) {
  expect(Number.isInteger(value) && value >= 1).toBe(true);
}

function expectValidRegion(region) {
  if (region === undefined) {
    return;
  }
  expectPositiveInteger(region.startLine);
  if (region.startColumn !== undefined) {
    expectPositiveInteger(region.startColumn);
  }
}

function expectValidLocation(location) {
  expect(typeof location.physicalLocation.artifactLocation.uri).toBe('string');
  expectValidRegion(location.physicalLocation.region);
}

function expectValidInvocation(invocation) {
  expect(typeof invocation.executionSuccessful).toBe('boolean');
  for (const notification of invocation.toolExecutionNotifications ?? []) {
    expect(typeof notification.message.text).toBe('string');
    expect(SARIF_LEVELS.has(notification.level)).toBe(true);
  }
}

function expectValidResult(result, ruleIds) {
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.length).toBeGreaterThan(0);
  expect(SARIF_LEVELS.has(result.level)).toBe(true);
  expect(ruleIds.has(result.ruleId)).toBe(true);
  for (const location of result.locations) {
    expectValidLocation(location);
  }
  for (const value of Object.values(result.partialFingerprints)) {
    expect(typeof value).toBe('string');
  }
}

function expectValidRun(run) {
  expect(typeof run.tool.driver.name).toBe('string');
  const rules = run.tool.driver.rules ?? [];
  const ruleIds = new Set(rules.map((rule) => rule.id));
  expect(ruleIds.size).toBe(rules.length);
  for (const invocation of run.invocations ?? []) {
    expectValidInvocation(invocation);
  }
  expect(Array.isArray(run.results)).toBe(true);
  for (const result of run.results) {
    expectValidResult(result, ruleIds);
  }
}

export function expectValidSarif(log) {
  expectMatchesSarifSchema(log);
  expect(log.version).toBe('2.1.0');
  expect(typeof log.$schema).toBe('string');
  expect(Array.isArray(log.runs)).toBe(true);
  expect(log.runs.length).toBeGreaterThan(0);
  for (const run of log.runs) {
    expectValidRun(run);
  }
}

function isForbiddenXmlCharacter(character) {
  const code = character.codePointAt(0);
  return (
    code <= 0x08 ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0xfffe ||
    code === 0xffff
  );
}

function expectXmlText(text, insideElement) {
  expect(text.replaceAll(XML_ENTITY, '')).not.toMatch(/[&>]/u);
  if (!insideElement) {
    expect(text.trim()).toBe('');
  }
}

function openElement(state, name, selfClosing) {
  if (state.stack.length === 0) {
    state.roots += 1;
  }
  if (selfClosing === '') {
    state.stack.push(name);
  }
}

function expectXmlToken(state, match) {
  const [, closing, name, , selfClosing, text, malformed] = match;
  expect(malformed, `malformed tag at offset ${String(match.index)}`).toBeUndefined();
  if (name === undefined) {
    expectXmlText(text, state.stack.length > 0);
  } else if (closing === '/') {
    expect(state.stack.pop()).toBe(name);
  } else {
    openElement(state, name, selfClosing);
  }
}

export function expectWellFormedXml(xml) {
  expect(xml.startsWith(XML_DECLARATION)).toBe(true);
  expect([...xml].filter(isForbiddenXmlCharacter)).toEqual([]);
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/u, '');
  const state = { stack: [], roots: 0 };
  for (const match of body.matchAll(XML_TOKEN)) {
    expectXmlToken(state, match);
  }
  expect(state.stack).toEqual([]);
  expect(state.roots).toBe(1);
}

export function attributeOf(xml, name) {
  return new RegExp(`${name}="([^"]*)"`, 'u').exec(xml)?.[1];
}
