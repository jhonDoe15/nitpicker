import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-moved-tsconfig-type-roots.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'typeRoots' }] };
}

let deepTarget = 'tmpdir()';
for (let level = 0; level < 10; level += 1) {
  deepTarget = `path.join(${deepTarget}, 'tsconfig.json')`;
}

tester.run('require-moved-tsconfig-type-roots', rule, {
  valid: [
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({
       extends: configPath, compilerOptions: { typeRoots: roots } }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     const config = { extends: configPath, compilerOptions: { noEmit: true, typeRoots: [] } };
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify(config));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({ extends: configPath, ...rest }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(
       path.join(folder, 'tsconfig.json'),
       JSON.stringify({ extends: configPath, compilerOptions: options }),
     );`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({ files: [] }));`,
    `writeFileSync(path.join(projectRoot, 'tsconfig.json'), JSON.stringify({ extends: './base.json' }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), text);`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'data.json'), JSON.stringify({ name: 'a' }));`,
    `writeFileSync(path.join(tmpdir(), '.eslintrc.json'), JSON.stringify({ extends: 'base' }));`,
    `writeFileSync(path.join(tmpdir(), '.babelrc'), JSON.stringify({ extends: './base' }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json', files }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({
       extends: configPath, compilerOptions: { types: [] } }));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     const config = { extends: configPath };
     config.compilerOptions = { typeRoots: roots };
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify(config));`,
    `const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
     const config = { extends: configPath };
     Object.assign(config, extra);
     writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify(config));`,
    `writeFileSync(${deepTarget}, JSON.stringify({ extends: configPath }));`,
  ],
  invalid: [
    invalid(`const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
      writeFileSync(folder + '/tsconfig.json', JSON.stringify({ extends: configPath }));`),
    invalid(
      `writeFileSync(path.join(tmpdir(), 0, 'tsconfig.json'), JSON.stringify({ extends: configPath }));`,
    ),
    invalid(
      `writeFileSync(\`\${tmpdir()}/tsconfig.build.json\`, JSON.stringify({ extends: configPath }));`,
    ),
    invalid(`const folder = mkdtempSync(path.join(tmpdir(), 'x-'));
      writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify({ extends: configPath, files }));`),
    invalid(`const folder = mkdtempSync(path.join(os.tmpdir(), 'x-'));
      const config = { extends: configPath, compilerOptions: { noEmit: true }, files };
      writeFileSync(path.join(folder, 'tsconfig.json'), JSON.stringify(config));`),
    invalid(`async function stage() {
      const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'x-'));
      const file = path.join(folder, 'tsconfig.json');
      await fs.promises.writeFile(file, JSON.stringify({ extends: configPath }, null, 2));
    }`),
    invalid(
      `writeFileSync(path.join(tmpdir(), 'tsconfig.json'), JSON.stringify({ 'extends': a, compilerOptions: {
        skipLibCheck: true } }));`,
    ),
  ],
});
