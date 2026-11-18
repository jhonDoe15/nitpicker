import path from 'node:path';
import vm from 'node:vm';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';

const ts = typescriptApi();

type Sources = Readonly<Record<string, string>>;

const LOADER = `
const cache = new Map();
function resolve(from, specifier) {
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.replace(/\\.js$/u, '').split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('/');
}
function load(name) {
  const cached = cache.get(name);
  if (cached !== undefined) {
    return cached.exports;
  }
  const module = { exports: {} };
  cache.set(name, module);
  const run = new Function('exports', 'require', 'module', sources[name]);
  run(module.exports, (specifier) => load(resolve(name, specifier)), module);
  return module.exports;
}
function shown(key, value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return value === undefined ? '<undefined>' : value;
}
Promise.resolve()
  .then(() => load(target).probe())
  .then(
    (value) => JSON.stringify(value, shown),
    (error) => 'threw ' + String(error?.message ?? error),
  );
`;

function compiled(sources: Sources): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sources).map(([name, text]) => [
      name.replace(/\.ts$/u, ''),
      ts.transpileModule(text, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    ]),
  );
}

export async function probeOf(sources: Sources, name: string): Promise<string> {
  const context = vm.createContext({
    sources: compiled(sources),
    target: name.replace(/\.ts$/u, ''),
  });
  const result: unknown = await vm.runInContext(LOADER, context, { timeout: 5000 });
  return String(result);
}

export function typeErrors(projectRoot: string): string[] {
  const configPath = path.join(projectRoot, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, projectRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const where =
      diagnostic.file === undefined
        ? ''
        : `${path.relative(projectRoot, diagnostic.file.fileName)}: `;
    return `${where}${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  });
}
