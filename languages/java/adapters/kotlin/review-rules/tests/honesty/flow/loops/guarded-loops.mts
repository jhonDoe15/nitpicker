import type { Span, TestScanned } from '../../../typed/discovery-types.mts';
import type { Construct } from '../../../typed/rule-types.mts';
import { escapeRegExp } from '../../../discovery/text-scan.mts';
import { assertsIn } from '../assertion-calls.mts';

const RECEIVER_WINDOW = 160;
const BUILDERS = 'listOf|setOf|arrayOf|sequenceOf|mutableListOf|mutableSetOf|arrayListOf';
const FIXED = new RegExp(String.raw`^(?:${BUILDERS})\s*(?:<[^<>]*>\s*)?\(\s*[^)*\s][^()]*\)$`, 'u');
const HEADER_SOURCE = /\sin\s+(?<source>[\s\S]+)$/u;
const RECEIVER = new RegExp(
  String.raw`(?<source>(?:${BUILDERS})\s*(?:<[^<>]*>\s*)?\([^()]*\)|(?<![\w.])[A-Za-z_]\w*)\s*$`,
  'u',
);
const NAME = /^[A-Za-z_]\w*$/u;
const WRITE = /(?<![\w.])(?<name>[a-z_]\w*)\s*(?:[-+*/]?=(?!=)|\+\+|--)/gu;
const LINE = /[^\n]+/gu;
type Loop = { readonly construct: Construct; readonly body: Span; readonly all: Construct[] };

function sourceOf({ code }: TestScanned, { header, from }: Construct): string {
  const found =
    header === undefined
      ? RECEIVER.exec(code.slice(Math.max(0, from - RECEIVER_WINDOW), from))
      : HEADER_SOURCE.exec(code.slice(header.start, header.end));
  return found?.groups?.['source']?.trim() ?? '';
}

function sizeAssertions(name: string): RegExp {
  const subject = escapeRegExp(name);
  const some = String.raw`[1-9]`;
  return new RegExp(
    [
      String.raw`assertEquals\(\s*${some}\d*\s*,\s*${subject}\.size\s*\)`,
      String.raw`assert(?:True\(\s*${subject}\.isNotEmpty\(\)|False\(\s*${subject}\.isEmpty\(\))`,
      String.raw`assertThat\(\s*${subject}\s*\)\s*\.\s*(?:hasSize\(\s*${some}|isNotEmpty\(|containsExactly\w*\(\s*[^)\s])`,
      String.raw`(?<![\w.])${subject}\s*\.?\s*(?:shouldHaveSize|shouldHaveAtLeastSize)\s*\(?\s*${some}`,
      String.raw`(?<![\w.])${subject}\s*\.\s*shouldNotBeEmpty\(\)`,
      String.raw`(?<![\w.])${subject}\.size\s+shouldBe\s+${some}`,
    ].join('|'),
    'gu',
  );
}

function unconditional({ all }: Loop, offset: number): boolean {
  return !all.some(({ from, to }) => from <= offset && offset < to);
}

function sizedBefore(scanned: TestScanned, loop: Loop, name: string): boolean {
  const { start } = loop.body;
  return [...scanned.code.slice(start, loop.construct.from).matchAll(sizeAssertions(name))].some(
    ({ index }) => unconditional(loop, start + index),
  );
}

function writtenNames({ code }: TestScanned, { construct, body }: Loop): string[] {
  const before = code.slice(body.start, construct.from);
  const written = construct.scans.flatMap(({ start, end }) =>
    [...code.slice(start, end).matchAll(WRITE)].map((match) => match.groups?.['name'] ?? ''),
  );
  return [...new Set(written)].filter((name) =>
    new RegExp(String.raw`(?<![\w.])var\s+${escapeRegExp(name)}\b`, 'u').test(before),
  );
}

function checkedAfter(scanned: TestScanned, loop: Loop): boolean {
  const names = writtenNames(scanned, loop);
  const from = loop.construct.to;
  if (names.length === 0) {
    return false;
  }
  const mentions = new RegExp(
    String.raw`(?<![\w.])(?:${names.map(escapeRegExp).join('|')})\b`,
    'u',
  );
  return [...scanned.code.slice(from, loop.body.end).matchAll(LINE)].some(
    ({ index, 0: line }) =>
      mentions.test(line) &&
      unconditional(loop, from + index) &&
      assertsIn(scanned, from + index, from + index + line.length),
  );
}

export function cannotPassSilently(scanned: TestScanned, loop: Loop): boolean {
  if (loop.construct.construct !== 'loop') {
    return false;
  }
  const source = sourceOf(scanned, loop.construct);
  return (
    FIXED.test(source) ||
    (NAME.test(source) && sizedBefore(scanned, loop, source)) ||
    checkedAfter(scanned, loop)
  );
}
