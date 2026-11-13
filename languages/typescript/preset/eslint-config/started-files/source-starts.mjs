import path from 'node:path';
import { scrubSource } from '../../../../../shared/started-files/scrub-source.mjs';

const SHEBANG = /^#!.*\b(?:node|nodejs|tsx|ts-node|bun|deno)\b/u;
const MAIN_GUARD = [
  /\bimport\.meta\.main\b/u,
  /\brequire\.main\s*===?\s*module\b/u,
  /\bprocess\.argv\[1\]\s*===?\s*(?:fileURLToPath\(\s*)?import\.meta\.(?:url|filename)\b/u,
  /\bimport\.meta\.(?:url|filename)\b[^\n]*===?\s*(?:pathToFileURL\(\s*)?process\.argv\[1\]/u,
];
const LAUNCH_CALL = /\b(?:new\s+Worker|fork|spawn|spawnSync|execFile|execFileSync)\s*\(/gu;
const URL_LITERAL = /new\s+URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url/gu;
const JOINED_LITERAL =
  /\b(?:join|resolve)\(\s*(?:import\.meta\.dirname|__dirname)\s*,\s*((?:(['"])[^'"]+\2\s*(?:,\s*)?)+)\)/gu;
const STRING_LITERAL = /(['"])([^'"\n]+)\1/gu;
const BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]{0,300});/gu;
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const SPAWNED_BINARY = /\b(?:spawn|spawnSync|execFile|execFileSync)\b/u;
const NODE_BINARY = /process\.execPath|['"]node['"]/u;
const LOOKAHEAD = 400;
const COMPILED_EXTENSIONS = { '.mjs': '.mts', '.js': '.ts', '.cjs': '.cts', '.jsx': '.tsx' };

function callArguments(text, start) {
  const window = text.slice(start, start + LOOKAHEAD);
  let depth = 0;
  for (const [offset, character] of window.split('').entries()) {
    depth += character === '(' ? 1 : 0;
    depth -= character === ')' ? 1 : 0;
    if (depth === 0) {
      return window.slice(0, offset);
    }
  }
  return window;
}

function moduleRelative(text) {
  const urls = [...text.matchAll(URL_LITERAL)].map(([, , literal]) => literal);
  const joined = [...text.matchAll(JOINED_LITERAL)].map(([, literals]) =>
    [...literals.matchAll(STRING_LITERAL)].map(([, , literal]) => literal).join('/'),
  );
  return [...urls, ...joined].filter((literal) => CODE_FILE.test(literal));
}

function launchRelative(text) {
  const own = new Set(moduleRelative(text));
  const plain = [...text.matchAll(STRING_LITERAL)].map(([, , literal]) => literal);
  return {
    moduleRelative: [...own],
    projectRelative: plain.filter((literal) => CODE_FILE.test(literal) && !own.has(literal)),
  };
}

function bindingsOf(code) {
  return new Map(
    [...code.matchAll(BINDING)].map(([, name, value]) => [name, launchRelative(value)]),
  );
}

function sourceVariants(file) {
  const extension = path.posix.extname(file);
  const converted = COMPILED_EXTENSIONS[extension];
  return converted === undefined
    ? [file]
    : [file, `${file.slice(0, -extension.length)}${converted}`];
}

function launchedFrom(file, code) {
  const directory = path.posix.dirname(file);
  const bindings = bindingsOf(code);
  const launches = [...code.matchAll(LAUNCH_CALL)]
    .map((match) => ({ match, text: callArguments(code, match.index + match[0].length - 1) }))
    .filter(({ match, text }) => !SPAWNED_BINARY.test(match[0]) || NODE_BINARY.test(text))
    .flatMap(({ text }) => [
      launchRelative(text),
      ...[...text.matchAll(IDENTIFIER)].flatMap(([name]) => bindings.get(name) ?? []),
    ]);
  return launches.flatMap(({ moduleRelative: own, projectRelative }) =>
    [...own.map((literal) => path.posix.join(directory, literal)), ...projectRelative].flatMap(
      (candidate) => sourceVariants(path.posix.normalize(candidate)),
    ),
  );
}

function startsItself(text) {
  const guarded = scrubSource(text, { keepStrings: false });
  return SHEBANG.test(text) || MAIN_GUARD.some((pattern) => pattern.test(guarded));
}

export function filesStartedBySource(file, text) {
  const code = scrubSource(text, { keepStrings: true });
  return [...(startsItself(text) ? [file] : []), ...launchedFrom(file, code)];
}
