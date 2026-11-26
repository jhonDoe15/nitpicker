import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-single-folder-config-lookup.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'singleFolder' }] };
}

tester.run('no-single-folder-config-lookup', rule, {
  valid: [
    "function pick(directory) { return existsSync(path.join(directory, 'package.json')) ? 'a' : DEFAULT_CONFIG; }",
    "function pick(directory) { return existsSync(path.join(directory, 'pnpm-lock.yaml')) ? 'a' : DEFAULT_CONFIG; }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 'tsconfig.json' : undefined; }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 1 : 0; }",
    "function pick(projectRoot) { return existsSync(path.join(projectRoot, 'tsconfig.json')) ? 'a' : DEFAULT_CONFIG; }",
    "function pick(directory) { let current = directory; while (!existsSync(path.join(current, 'tsconfig.json'))) { current = path.dirname(current); } return current; }",
    "function pick(directory) { const found = findUp('tsconfig.json', { cwd: directory }); return existsSync(path.join(directory, 'tsconfig.json')) ? found : DEFAULT_CONFIG; }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 'a' : nearestCoveringConfig(directory) ?? DEFAULT_CONFIG; }",
    "function own(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 'a' : DEFAULT_CONFIG; }\nfunction walk(directory) { for (let current = directory; ; current = path.dirname(current)) { const found = own(current); if (found !== DEFAULT_CONFIG) { return found; } } }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 'a' : DEFAULT_CONFIG; }\nfunction caller(directory) { return findUp('tsconfig.json', { cwd: directory }) ?? pick(directory); }",
    "function pick(directory) { return existsSync(path.join(directory, 'notes.txt')) ? 'a' : DEFAULT_CONFIG; }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json', 'x')) ? 'a' : DEFAULT_CONFIG; }",
    "function pick(directory) { try { return readFileSync(path.join(directory, 'package.json'), 'utf8'); } catch { return DEFAULT_TEXT; } }",
    "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? read(directory) : fail(directory); }",
  ],
  invalid: [
    invalid(
      "function pick(directory) { return existsSync(path.join(directory, 'tsconfig.json')) ? 'tsconfig.json' : DEFAULT_CONFIG; }",
    ),
    invalid(
      "const config = existsSync(join(directory, 'tsconfig.json')) ? 'tsconfig.json' : defaultConfig();",
    ),
    invalid(
      "function pick(directory) { if (!existsSync(path.join(directory, '.prettierrc.json'))) { return DEFAULT_PRETTIER; } return read(directory); }",
    ),
    invalid(
      "function pick(directory) { if (existsSync(path.join(directory, 'pyproject.toml'))) { return read(directory); } else { return {}; } }",
    ),
    invalid(
      "const NAME = 'jsconfig.json'; function pick(directory) { const file = path.join(directory, NAME); return existsSync(file) ? file : DEFAULT_FILE; }",
    ),
    invalid(
      "async function pick(directory) { return (await pathExists(path.join(directory, '.editorconfig'))) ? 'a' : DEFAULT_STYLE; }",
    ),
    invalid(
      "function pick(directory) { try { return JSON.parse(readFileSync(path.join(directory, 'tsconfig.json'), 'utf8')); } catch { return DEFAULT_TSCONFIG; } }",
    ),
    invalid(
      "function pick(directory) { return existsSync(path.join(directory, 'eslint.config.mjs')) ? 'a' : 'bundled.mjs'; }",
    ),
  ],
});
