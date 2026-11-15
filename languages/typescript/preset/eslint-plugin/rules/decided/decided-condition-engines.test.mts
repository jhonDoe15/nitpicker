import { bannedAndAllowedCase, describeEngineParity } from '../../test-support/engine-parity.mts';

const BANNED = [
  'export function size(count: number): string {',
  '  if (count > 10) {',
  "    return 'many';",
  '  }',
  '  if (count > 20) {',
  "    return 'lots';",
  '  }',
  "  return 'few';",
  '}',
  'export function label(kind: string): string {',
  "  if (kind === 'none') {",
  "    return '';",
  '  }',
  "  return kind === 'none' ? '-' : kind;",
  '}',
].join('\n');

type Extension = 'ts' | 'mjs';

const BANNED_LINES: Record<Extension, number[]> = { ts: [5, 14], mjs: [6, 16] };

const ALLOWED = [
  'export function size(count: number): string {',
  '  if (count > 20) {',
  "    return 'lots';",
  '  }',
  '  if (count > 10) {',
  "    return 'many';",
  '  }',
  "  return 'few';",
  '}',
  'export function label(kind: string): string {',
  "  if (kind === 'none') {",
  "    return '';",
  '  }',
  '  return kind;',
  '}',
].join('\n');

const JSDOC = '/** @param {number} count */\n';
const LABEL_JSDOC = '/** @param {string} kind */\n';

function javascriptOf(source: string) {
  return source
    .replace('export function size', `${JSDOC}export function size`)
    .replace('export function label', `${LABEL_JSDOC}export function label`)
    .replace('(count: number): string', '(count)')
    .replace('(kind: string): string', '(kind)');
}

const BANNED_JAVASCRIPT = javascriptOf(BANNED);
const ALLOWED_JAVASCRIPT = javascriptOf(ALLOWED);

function expectedIn(files: string[], extension: Extension) {
  return files
    .flatMap((file) => BANNED_LINES[extension].map((line) => `${file}:${String(line)}`))
    .sort((left, right) => left.localeCompare(right));
}

function caseFor(javascript: boolean, extension: Extension, banned: string, allowed: string) {
  return bannedAndAllowedCase({
    javascript,
    extension,
    banned,
    allowed,
    expectedFor: (files) => expectedIn(files, extension),
  });
}

describeEngineParity({
  title: 'decided conditions',
  itTitle:
    'reports each decided condition on both engines, through the type-aware fallback on oxlint',
  rule: 'nitpicker/no-decided-condition',
  prefix: 'nitpicker-decided-condition-',
  policy: 'logic',
  environment: process.env,
  typeAwareFallback: true,
  cases: [
    caseFor(false, 'ts', BANNED, ALLOWED),
    caseFor(true, 'mjs', BANNED_JAVASCRIPT, ALLOWED_JAVASCRIPT),
  ],
});
