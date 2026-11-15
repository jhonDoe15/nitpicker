import { describeEngineParity } from '../../test-support/engine-parity.mts';

const BANNED = [
  'export function describe(code: string): string {',
  '  if (code === "order not found") {',
  '    return "order not found";',
  '  }',
  '  return code + "order not found";',
  '}',
].join('\n');

const BANNED_LINES = [5];

const ALLOWED = [
  'const NOT_FOUND = "order not found";',
  'export function describe(code: string): string {',
  '  if (code === NOT_FOUND) {',
  '    return NOT_FOUND;',
  '  }',
  `  return \`\${code}\${NOT_FOUND}\`;`,
  '}',
].join('\n');

function caseFor(javascript: boolean, extension: string, banned: string, allowed: string) {
  return {
    javascript,
    files: {
      [`src/main/banned.${extension}`]: banned,
      'test/banned.test.mjs': banned.replaceAll(': string', ''),
      [`src/main/allowed.${extension}`]: allowed,
    },
    expected: BANNED_LINES.map((line) => `src/main/banned.${extension}:${String(line)}`),
  };
}

describeEngineParity({
  title: 'repeated string literals',
  itTitle: 'reports the third use in production code only, on both engines',
  rule: 'nitpicker/no-repeated-string-literal',
  prefix: 'nitpicker-repeated-string-',
  policy: 'production-policy',
  environment: process.env,
  typeAwareFallback: false,
  cases: [
    caseFor(false, 'ts', BANNED, ALLOWED),
    caseFor(true, 'mjs', BANNED.replaceAll(': string', ''), ALLOWED.replaceAll(': string', '')),
  ],
});
