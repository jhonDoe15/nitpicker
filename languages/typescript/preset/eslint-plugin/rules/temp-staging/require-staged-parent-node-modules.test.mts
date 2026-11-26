import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-staged-parent-node-modules.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'stagedModules' }] };
}

const STAGE = `const stage = mkdtempSync(path.join(tmpdir(), 'stage-'));`;
const LINK = `for (const entry of readdirSync(projectRoot)) { symlinkSync(path.join(projectRoot, entry), path.join(stage, entry)); }`;

tester.run('require-staged-parent-node-modules', rule, {
  valid: [
    `function run() { ${STAGE} ${LINK} symlinkSync(path.join(parent, 'node_modules'), path.join(stage, 'node_modules')); writeFileSync(path.join(stage, 'tsconfig.json'), text); }`,
    `function run() { ${STAGE} ${LINK} spawn(tool, ['--tsconfig', path.join(stage, 'tsconfig.json')], { env: { NODE_PATH: modules } }); }`,
    `function run() { ${STAGE} ${LINK} spawn(tool, ['--preserve-symlinks'], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} readFileSync(path.join(stage, 'a.txt')); }`,
    `function run() { ${STAGE} writeFileSync(path.join(stage, 'tsconfig.json'), text); }`,
    `function run() { ${STAGE} spawn(tool, [], { cwd: stage }); }`,
    `function run() { ${STAGE} symlinkSync(a, path.join(stage, 'a')); spawn(tool, [], { cwd: stage }); }`,
    `function run() { const stage = path.join(root, 'out'); ${LINK} spawn(tool, [], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} } function other() { spawn(tool, [], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} spawn(tool, ['--tsconfig', path.join(projectRoot, 'tsconfig.json')]); }`,
    `function run() { ${STAGE} ${LINK} spawn('npm', ['pack'], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} spawnSync('tar', ['-czf', 'a.tgz', '.'], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} execSync('git init', { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} spawn('npm', ['install'], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} spawn('npx', ['prettier', '.'], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} writeFileSync(path.join(stage, 'package.json'), text); }`,
    `function run() { ${STAGE} ${LINK} spawn(tool, [], { cwd: stage }); }`,
    `function run() { ${STAGE} ${LINK} link(); spawn('tsc', [], { cwd: stage }); } function link() { const p = 'node_modules'; } run();`,
    `function run() { ${STAGE} ${LINK} spawn('tsc', [], { cwd: stage }); } function caller() { process.env.NODE_PATH = modules; run(); } caller(); run();`,
  ],
  invalid: [
    invalid(
      `function run() { ${STAGE} ${LINK} writeFileSync(path.join(stage, 'tsconfig.json'), text); }`,
    ),
    invalid(
      `function run() { ${STAGE} ${LINK} spawnSync(tool, ['--tsconfig', path.join(stage, 'tsconfig.json')]); }`,
    ),
    invalid(`function run() { ${STAGE} ${LINK} execFileSync(tool, ['-p', stage]); }`),
    invalid(`function run() { ${STAGE} ${LINK} spawn('tsc', [], { cwd: stage }); }`),
    invalid(`async function run() {
      const stage = await mkdtemp(path.join(tmpdir(), 'stage-'));
      const entries = await readdir(projectRoot);
      await Promise.all(entries.map((entry) => symlink(path.join(projectRoot, entry), path.join(stage, entry))));
      await writeFile(path.join(stage, 'package.json'), text);
      await execa('vitest', ['run'], { cwd: stage });
    }`),
    invalid(`function run() { ${STAGE} ${LINK} execSync('npx eslint .', { cwd: stage }); }`),
    invalid(`function run() { ${STAGE} ${LINK} spawn('npx', ['tsc', '-b'], { cwd: stage }); }`),
    invalid(`function run() { ${STAGE} ${LINK} spawn('bin/tsc.cmd', [], { cwd: stage }); }`),
    invalid(
      `function other() { const x = 'node_modules'; } function run() { ${STAGE} ${LINK} spawn('node', [], { cwd: stage }); }`,
    ),
  ],
});
