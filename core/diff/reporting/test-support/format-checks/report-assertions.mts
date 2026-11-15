import { expect } from 'vitest';
import { escapeRegExp } from '../output-expectations.mts';
import { expectMatchesSarifSchema } from './sarif-schema.mts';
import { isSarifLog } from './sarif-shapes.mts';
import type {
  SarifInvocation,
  SarifLocation,
  SarifRegion,
  SarifResult,
  SarifRun,
  XmlState,
} from './sarif-shapes.mts';

const SARIF_LEVELS = new Set(['none', 'note', 'warning', 'error']);
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos);/gu;
const XML_TOKEN =
  /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>|([^<]+)|(<)/gu;

function expectPositiveInteger(value: number): void {
  expect(Number.isInteger(value) && value >= 1).toBe(true);
}

function expectValidRegion(region: SarifRegion | undefined): void {
  if (region === undefined) {
    return;
  }
  expectPositiveInteger(region.startLine);
  if (region.startColumn !== undefined) {
    expectPositiveInteger(region.startColumn);
  }
}

function expectValidLocation(location: SarifLocation): void {
  expect(typeof location.physicalLocation.artifactLocation.uri).toBe('string');
  expectValidRegion(location.physicalLocation.region);
}

function expectValidInvocation(invocation: SarifInvocation): void {
  expect(typeof invocation.executionSuccessful).toBe('boolean');
  for (const notification of invocation.toolExecutionNotifications ?? []) {
    expect(typeof notification.message.text).toBe('string');
    expect(SARIF_LEVELS.has(notification.level)).toBe(true);
  }
}

function expectValidResult(result: SarifResult, ruleIds: ReadonlySet<string>): void {
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

function expectValidRun(run: SarifRun): void {
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

export function expectValidSarif(log: unknown): void {
  expectMatchesSarifSchema(log);
  if (!isSarifLog(log)) {
    throw new Error('The SARIF log is not an object');
  }
  expect(log.version).toBe('2.1.0');
  expect(typeof log.$schema).toBe('string');
  expect(Array.isArray(log.runs)).toBe(true);
  expect(log.runs.length).toBeGreaterThan(0);
  for (const run of log.runs) {
    expectValidRun(run);
  }
}

function isForbiddenXmlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code <= 0x08 ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0xfffe ||
    code === 0xffff
  );
}

function expectXmlText(text: string, insideElement: boolean): void {
  expect(text.replaceAll(XML_ENTITY, '')).not.toMatch(/[&>]/u);
  if (!insideElement) {
    expect(text.trim()).toBe('');
  }
}

function openElement(state: XmlState, name: string, selfClosing: string): void {
  if (state.stack.length === 0) {
    state.roots += 1;
  }
  if (selfClosing === '') {
    state.stack.push(name);
  }
}

function expectXmlToken(state: XmlState, match: RegExpExecArray): void {
  const [, closing, name, , selfClosing = '', text = '', malformed] = match;
  expect(malformed, `malformed tag at offset ${String(match.index)}`).toBeUndefined();
  if (name === undefined) {
    expectXmlText(text, state.stack.length > 0);
  } else if (closing === '/') {
    expect(state.stack.pop()).toBe(name);
  } else {
    openElement(state, name, selfClosing);
  }
}

export function expectWellFormedXml(xml: string): void {
  expect(xml.startsWith(XML_DECLARATION)).toBe(true);
  expect(Array.from(xml).filter(isForbiddenXmlCharacter)).toEqual([]);
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/u, '');
  const state: XmlState = { stack: [], roots: 0 };
  for (const match of body.matchAll(XML_TOKEN)) {
    expectXmlToken(state, match);
  }
  expect(state.stack).toEqual([]);
  expect(state.roots).toBe(1);
}

export function attributeOf(xml: string, name: string): string | undefined {
  return new RegExp(`${escapeRegExp(name)}="([^"]*)"`, 'u').exec(xml)?.[1];
}
