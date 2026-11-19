import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unanchored-affix-replace.mts';

const ruleTester = typescriptRuleTester();

function failing(messageId: 'suffix' | 'prefix', codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId }] }));
}

ruleTester.run('no-unanchored-affix-replace', rule, {
  valid: cases([
    "const repo = name.replace(/\\.git$/i, '');",
    "const repo = name.endsWith('.git') ? name.slice(0, -4) : name;",
    "const repo = name.endsWith('.git') ? name.replace('.git', '') : name;",
    "const base = file.replace(new RegExp('\\\\.json$'), '');",
    "const text = name.replace('.git', '.zip');",
    "const text = name.replace('.', '');",
    "const text = name.replace('.verylongsuffix', '');",
    "const text = name.replaceAll('.git', '');",
    "const text = name.replace('foo', '');",
    "const short = p.startsWith(home) ? p.replace(home, '~') : p;",
    "const short = p.startsWith(homeDir) && p.replace(homeDir, '~');",
    "const text = line.replace(label, '');",
    'const out = name.replace(...args);',
    'url.port = nextPort;',
    "const text = name.replace(pattern, '');",
    `const name = \`\${id}.json\`; const key = name.replace('.json', '');`,
    "const name = id + '.json'; const key = name.replace('.json', '');",
    "if (file.startsWith(rootDir)) { return file.replace(rootDir, ''); }",
    "if (name.endsWith('.git')) { r = name.replace('.git', ''); }",
    "if (name.endsWith('.git')) r = name.replace('.git', '');",
    "const names = files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));",
  ]),
  invalid: [
    ...failing('suffix', [
      "const repo = parts[1].replace('.git', '');",
      "const base = file.replace('.json', '');",
      "const base = file.replace(`.min`, '');",
      "const ext = '.ts'; const base = file.replace(ext, '');",
      "if (ready) { return file.replace('.json', ''); }",
      "const names = files.map((f) => f.replace('.json', ''));",
    ]),
    ...failing('prefix', [
      "const short = path.replace(os.homedir(), '~');",
      "const short = path.replace(process.cwd(), '');",
      'const next = url.replace(parsed.port, newPort);',
      "const rel = url.replace(parsedBaseUrl.pathname, '');",
      'const out = input.replace(root, output);',
      "const rel = file.replace(workspaceRoot, '');",
      "const rel = file.replace(this.baseDir, '');",
      "const rel = file.replace(homedir(), '~');",
    ]),
  ],
});
