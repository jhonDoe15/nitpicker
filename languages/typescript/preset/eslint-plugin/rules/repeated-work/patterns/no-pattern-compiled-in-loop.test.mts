import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-pattern-compiled-in-loop.mts';

const tester = typescriptRuleTester();

const PATH = 'import path from "node:path";\n';
const MINIMATCH = 'import { minimatch, Minimatch } from "minimatch";\n';
const PICOMATCH = 'import picomatch from "picomatch";\n';
const MICROMATCH = 'import micromatch from "micromatch";\n';

function compiled(code: string, call: string, pattern: string) {
  return { code, errors: [{ messageId: 'compiledPerPass', data: { call, pattern } }] };
}

tester.run('no-pattern-compiled-in-loop', rule, {
  valid: [
    'import picomatch from "picomatch";\nlet g = "a"; function bump() { g += "x"; }\nexport function f(xs: string[]) { for (const x of xs) { bump(); picomatch(g)(x); } }',
    'import picomatch from "picomatch";\nexport class C { g = "a"; next() { this.g += "x"; } f(xs: string[]) { for (const x of xs) { this.next(); picomatch(this.g)(x); } } }',
    'import picomatch from "picomatch";\nexport function f(xs: string[], o: { g: string }) { for (const x of xs) { rot(o); picomatch(o.g)(x); } }\ndeclare function rot(o: { g: string }): void;',
    'import picomatch from "picomatch";\nexport function f(xs: string[], p: string, cache: Map<string, unknown>) { for (const x of xs) { if (!cache.has(p)) cache.set(p, picomatch(p)); console.log(x); } }',
    'import picomatch from "picomatch";\nexport function f(xs: string[], p: string) { for (const x of xs) { const m = picomatch(p); return m(x); } return false; }',
    `${PATH}export function one(file: string, pattern: string) { return path.matchesGlob(file, pattern); }`,
    `${PATH}export function each(files: string[], patterns: string[]) { return files.map((file, i) => path.matchesGlob(file, patterns[i] ?? "")); }`,
    `${PATH}export function each(pairs: { file: string; glob: string }[]) { return pairs.filter((pair) => path.matchesGlob(pair.file, pair.glob)); }`,
    `${PATH}export function each(files: string[]) { for (const file of files) { const glob = \`\${path.dirname(file)}/**\`; if (path.matchesGlob(file, glob)) return file; } return undefined; }`,
    `${PICOMATCH}export function each(files: string[], pattern: string) { const isMatch = picomatch(pattern); return files.filter((file) => isMatch(file)); }`,
    `${MINIMATCH}export function each(files: string[], pattern: string) { const matcher = new Minimatch(pattern); return files.filter((file) => matcher.match(file)); }`,
    `${MINIMATCH}export function each(files: string[], patterns: string[]) { return patterns.map((pattern) => minimatch.match(files, pattern)); }`,
    `${PATH}export function each(files: string[], pattern: string) { let glob = pattern; for (const file of files) { glob = \`\${glob}/**\`; path.matchesGlob(file, glob); } }`,
    `${PATH}export function each(files: string[], options: { glob: string }) { for (const file of files) { options.glob = file; path.matchesGlob(file, options.glob); } }`,
    `${PATH}export function each(files: string[]) { for (const file of files) { path.matchesGlob(file, next()); } }\ndeclare function next(): string;`,
    `${PATH}export function each(files: string[], pattern: string) { for (const file of files) { const check = () => path.matchesGlob(file, pattern); register(check); } }\ndeclare function register(check: () => boolean): void;`,
    'export function each(files: string[], pattern: string) { return files.filter((file) => matchesGlob(file, pattern)); }\ndeclare function matchesGlob(file: string, pattern: string): boolean;',
    'export function each(files: string[], pattern: string, lib: { isMatch(file: string, pattern: string): boolean }) { return files.filter((file) => lib.isMatch(file, pattern)); }',
    `${PATH}export function each(files: string[], pattern: string) { return files.filter((file) => path.join(file, pattern)); }`,
    `${MICROMATCH}export function each(files: string[], patterns: string[]) { return files.filter((file) => micromatch.isMatch(file, ...patterns)); }`,
    `${MICROMATCH}export function each(files: string[], pattern: string) { return files.filter((file) => micromatch.constructor === Object); }`,
  ],
  invalid: [
    compiled(
      `${PATH}export function tests(directories: string[], files: string[]) { for (const directory of directories) { files.filter((file) => path.matchesGlob(file, \`\${directory}/**/*.test.ts\`)); } }`,
      'path.matchesGlob',
      '`${directory}/**/*.test.ts`',
    ),
    compiled(
      `${PATH}export function each(files: string[], pattern: string) { for (const file of files) { if (path.posix.matchesGlob(file, pattern)) return file; } return undefined; }`,
      'path.posix.matchesGlob',
      'pattern',
    ),
    compiled(
      'import { matchesGlob } from "node:path";\nexport function each(files: string[]) { return files.some((file) => matchesGlob(file, "**/*.ts")); }',
      'matchesGlob',
      '"**/*.ts"',
    ),
    compiled(
      `${MINIMATCH}export function each(files: string[], pattern: string) { return files.filter((file) => minimatch(file, pattern, { dot: true })); }`,
      'minimatch',
      'pattern',
    ),
    compiled(
      `${MINIMATCH}export function each(files: string[], pattern: string) { for (const file of files) { new Minimatch(pattern).match(file); } }`,
      'new Minimatch',
      'pattern',
    ),
    compiled(
      'import minimatch from "minimatch";\nexport function each(files: string[], root: string) { return files.map((file) => minimatch.makeRe(root + "/**")); }',
      'minimatch.makeRe',
      'root + "/**"',
    ),
    compiled(
      `${PICOMATCH}export function each(files: string[], pattern: string) { return files.filter((file) => picomatch.isMatch(file, pattern)); }`,
      'picomatch.isMatch',
      'pattern',
    ),
    compiled(
      `${PICOMATCH}export function each(files: string[], config: { glob: string }) { let count = 0; while (count < files.length) { picomatch(config.glob)(files[count] ?? ""); count += 1; } }`,
      'picomatch',
      'config.glob',
    ),
    compiled(
      `${MICROMATCH}export function each(files: string[], patterns: string[]) { return files.filter((file) => micromatch.isMatch(file, patterns)); }`,
      'micromatch.isMatch',
      'patterns',
    ),
    compiled(
      'const micromatch = require("micromatch");\nexport function each(groups: string[][], pattern: string) { for (const group of groups) { micromatch(group, pattern); } }',
      'micromatch',
      'pattern',
    ),
  ],
});
