import { spawnSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../../../../shared/processes/deadlines.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';

const SEARCHED = [
  '*.java',
  '*.kt',
  '*.kts',
  '*.groovy',
  '*.gradle',
  '*.xml',
  '*.properties',
  '*.yml',
  '*.yaml',
  '*.json',
  '*.factories',
  '*META-INF/services/*',
].map((pattern) => `:(top)${pattern}`);
const NO_MATCH = 1;
const OUTPUT_BYTES = 16 * 1024 * 1024;
const WORD = '[A-Za-z0-9_]';

type NameLookup = (name: string) => boolean;
export type ProjectNames = { readonly quoted: NameLookup; readonly extended: NameLookup };

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

function quotedPattern(name: string): RegExp {
  return new RegExp(`"[^"\\n]*(?<!${WORD})${escapeRegExp(name)}(?!${WORD})[^"\\n]*"`, 'u');
}

function extendedPattern(name: string): RegExp {
  return new RegExp(`(?:\\bextends|:)\\s+(?:[\\w$]+\\.)*${escapeRegExp(name)}(?![\\w$])`, 'u');
}

function matchingLines(projectRoot: string, name: string): readonly string[] | undefined {
  const result = spawnSync(
    'git',
    ['grep', '-I', '-h', '-F', '-w', '--untracked', '-e', name, '--', ...SEARCHED],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS },
  );
  if (result.error !== undefined || (result.status !== 0 && result.status !== NO_MATCH)) {
    return undefined;
  }
  return result.stdout.split('\n');
}

function lookup(
  lines: (name: string) => readonly string[] | undefined,
  pattern: (name: string) => RegExp,
): NameLookup {
  return (name) => {
    const found = lines(name);
    const wanted = pattern(name);
    return found === undefined || found.some((line) => wanted.test(line));
  };
}

export function projectNames(projectRoot: string | undefined): ProjectNames {
  const seen = new Map<string, readonly string[] | undefined>();
  function lines(name: string): readonly string[] | undefined {
    if (!seen.has(name)) {
      seen.set(name, projectRoot === undefined ? undefined : matchingLines(projectRoot, name));
    }
    return seen.get(name);
  }
  return { quoted: lookup(lines, quotedPattern), extended: lookup(lines, extendedPattern) };
}
