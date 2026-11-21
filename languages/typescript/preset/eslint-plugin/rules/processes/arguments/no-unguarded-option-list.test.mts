import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unguarded-option-list.mts';

const tester = typescriptRuleTester();
const CP = "import { spawnSync } from 'node:child_process'; import { readdirSync } from 'node:fs';";

function invalid(code: string, messageId = 'emptyOptionValue') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-unguarded-option-list', rule, {
  valid: [
    `${CP} export function lint(dirs) { spawnSync('linter', ['--dir', dirs.join(','), '--format', 'sarif']); }`,
    `${CP} export function lint(all) { const dirs = all.filter(exists); if (dirs.length === 0) return; spawnSync('linter', ['--dir', dirs.join(',')]); }`,
    `${CP} export function lint(all) { const dirs = all.filter(exists); if (!dirs.some(Boolean)) return; spawnSync('linter', ['--dir', ...dirs]); }`,
    `${CP} export function lint(root) { spawnSync('tool', ['--fix', ...readdirSync(root).filter((name) => name.endsWith('.ts'))]); }`,
    `${CP} export function clean(patterns) { spawnSync('git', ['clean', '-fd', ...patterns.flatMap((p) => ['-e', p])]); }`,
    `${CP} export function lint(root) { const files = readdirSync(root); spawnSync('tool', ['-f', \`\${files.length}\`, files.join(' ')]); }`,
    `${CP} export function lint() { const dirs = ['src', 'test']; spawnSync('linter', ['--dir', dirs.join(',')]); }`,
    `${CP} export function lint(all) { const dirs = all.map(String); spawnSync('linter', ['--dir', dirs.join(',')]); }`,
    `${CP} export function lint(all) { const dirs = all.filter(exists); spawnSync('linter', ['src', dirs.join(',')]); }`,
    `${CP} export function lint(all) { const dirs = all.filter(exists); spawnSync('linter', [\`--dir=\${dirs.join(',')}\`]); }`,
    'export function config(globs) { const files = globs.filter(Boolean); if (files.length > 0) blocks.push({ files, rules: {} }); }',
    'export function config(globs) { blocks.push({ files: globs, rules: {} }); }',
    `${CP} export function f(all) { const dirs = all.filter(Boolean); if (dirs.join(',') === '') return; spawnSync('x', ['--dir', dirs.join(',')]); }`,
    `${CP} export function f(all) { const dirs = all.filter(Boolean); const [first] = dirs; if (!first) return; spawnSync('x', ['--dir', dirs.join(',')]); }`,
    `${CP} export function f(all) { const dirs = all.filter(Boolean); for (const d of dirs) { spawnSync('x', ['--dir', dirs.join(',')]); } }`,
    'export function config(globs) { const files = globs.filter(Boolean); render({ files, rules: {} }); }',
    'export function pick(globs) { const files = globs.filter(Boolean); list.push({ files, title: "x" }); }',
  ],
  invalid: [
    invalid(
      `${CP} export function lint(all) { const sourceFolders = all.filter(exists); spawnSync('linter', ['--dir', sourceFolders.join(','), '--format', 'sarif']); }`,
    ),
    invalid(
      `${CP} export function lint(root) { const files = readdirSync(root); spawnSync('tool', ['-f', files.join(' ')]); }`,
    ),
    invalid(
      'export function config(packages) { const testGlobs = packages.filter((p) => p.tests).map((p) => p.glob); configs.push({ files: testGlobs, rules: testRules }); }',
      'emptyFiles',
    ),
    invalid(
      'export function config(globs) { const files = globs.filter(Boolean); return [{ files, languageOptions: {} }]; }',
      'emptyFiles',
    ),
  ],
});
