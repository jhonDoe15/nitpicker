import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { escapeRegExp } from '../typed/shared-views.mts';
import type { RunnerEvidence, ScriptReference, Scripts } from '../typed/command-types.mts';
import {
  binaryName,
  commandRunners,
  commandSegments,
  parseTestCommand,
} from '../script-command.mts';

export const TEST_SCRIPT = 'test';

const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const NPM_TEST = new Set(['test', 't', 'tst']);
const PASSING_MANAGERS = new Set(['pnpm', 'yarn']);
const RUN_ONLY_MANAGERS = new Set(['bun']);
const RUN_ALL = new Set(['npm-run-all', 'run-s', 'run-p']);
const ANY_NAME_PARTS = '.*';
const WITHIN_NAME_PART = '[^:]*';
const MANAGER_VALUED_OPTIONS = new Set([
  '-w',
  '--workspace',
  '--prefix',
  '-C',
  '--dir',
  '--cwd',
  '--filter',
  '-F',
]);
const RUN_ALL_VALUED_OPTIONS = new Set(['--max-parallel', '--npm-path']);
const ARGUMENTS_SEPARATOR = '--';

type Words = { readonly tokens: readonly string[]; readonly words: readonly string[] };

function operands(tokens: readonly string[], valued: ReadonlySet<string>): number[] {
  const found: number[] = [];
  const pending = { value: false };
  for (const [index, token] of tokens.entries()) {
    const isValue = pending.value;
    pending.value = !isValue && valued.has(token);
    if (token === ARGUMENTS_SEPARATOR && !isValue) {
      break;
    }
    if (!(isValue || token.startsWith('-'))) {
      found.push(index);
    }
  }
  return found;
}

function forwarded(words: readonly string[], separatorRequired: boolean): readonly string[] {
  const separator = words.indexOf(ARGUMENTS_SEPARATOR);
  if (separator !== -1) {
    return words.slice(separator + 1);
  }
  return separatorRequired ? [] : words;
}

function npmReference(tokens: readonly string[], words: readonly string[]): ScriptReference[] {
  const [first, second] = operands(tokens, MANAGER_VALUED_OPTIONS);
  if (first === undefined) {
    return [];
  }
  if (NPM_TEST.has(tokens[first] ?? '')) {
    return [{ name: TEST_SCRIPT, rest: forwarded(words.slice(first + 1), true) }];
  }
  if (!NPM_RUN.has(tokens[first] ?? '') || second === undefined) {
    return [];
  }
  return [{ name: tokens[second] ?? '', rest: forwarded(words.slice(second + 1), true) }];
}

function passingReference(
  tokens: readonly string[],
  words: readonly string[],
  requiresRun: boolean,
): ScriptReference[] {
  const [first, second] = operands(tokens, MANAGER_VALUED_OPTIONS);
  const named = first !== undefined && tokens[first] === 'run' ? second : first;
  if (named === undefined || (requiresRun && named === first)) {
    return [];
  }
  return [{ name: tokens[named] ?? '', rest: forwarded(words.slice(named + 1), false) }];
}

function namePattern(text: string): RegExp {
  const parts = text.split('**').map((part) => part.split('*').map(escapeRegExp));
  const source = parts.map((part) => part.join(WITHIN_NAME_PART)).join(ANY_NAME_PARTS);
  return new RegExp(`^${source}$`, 'u');
}

function runAllReferences(tokens: readonly string[], scripts: Scripts): ScriptReference[] {
  return operands(tokens, RUN_ALL_VALUED_OPTIONS).flatMap((index) => {
    const [pattern = '', ...rest] = (tokens[index] ?? '').trim().split(/\s+/u);
    const matcher = namePattern(pattern);
    const names = Object.keys(scripts).filter((name) => matcher.test(name));
    return names.map((name) => ({ name, rest: forwarded(rest, false) }));
  });
}

function managerReferences(
  name: string,
  { tokens, words }: Words,
  scripts: Scripts,
): ScriptReference[] {
  if (RUN_ALL.has(name)) {
    return runAllReferences(tokens, scripts);
  }
  if (name === 'npm') {
    return npmReference(tokens, words);
  }
  return passingReference(tokens, words, RUN_ONLY_MANAGERS.has(name));
}

function segmentReferences(
  { tokens, words, starts }: Words & { readonly starts: readonly number[] },
  scripts: Scripts,
): (ScriptReference & { readonly start: number })[] {
  const index = tokens.findIndex((token) => {
    const name = binaryName(token);
    return (
      [PASSING_MANAGERS, RUN_ONLY_MANAGERS, RUN_ALL].some((names) => names.has(name)) ||
      name === 'npm'
    );
  });
  if (index === -1) {
    return [];
  }
  const name = binaryName(tokens[index] ?? '');
  const after = { tokens: tokens.slice(index + 1), words: words.slice(index + 1) };
  return managerReferences(name, after, scripts).map((found) => ({
    ...found,
    start: starts[index] ?? 0,
  }));
}

function textBefore(command: string, index: number): string {
  const before = command.slice(0, index).trimEnd();
  return before === '' ? '' : `${before} `;
}

function scriptReferences(
  command: string,
  scripts: Scripts,
): { name: string; prefix: string; rest: string }[] {
  return commandSegments(command)
    .flatMap((segment) => segmentReferences(segment, scripts))
    .map(({ name, rest, start }) => ({
      name,
      prefix: textBefore(command, start),
      rest: rest.length === 0 ? '' : ` ${rest.join(' ')}`,
    }));
}

function expandedCommands(scripts: Scripts, name: string): string[] {
  const pending = [{ name, prefix: '', suffix: '' }];
  const seen = new Set([name]);
  const commands: string[] = [];
  for (const current of pending) {
    const command = scripts[current.name];
    if (typeof command !== 'string') {
      continue;
    }
    commands.push(`${current.prefix}${command}${current.suffix}`);
    const references = scriptReferences(command, scripts).filter(
      (reference) => !seen.has(reference.name),
    );
    for (const reference of references) {
      seen.add(reference.name);
      pending.push({
        name: reference.name,
        prefix: `${current.prefix}${reference.prefix}`,
        suffix: `${reference.rest}${current.suffix}`,
      });
    }
  }
  return commands;
}

export function otherTestScriptNames(scripts: Scripts): string[] {
  return Object.keys(scripts).filter(
    (name) => name !== TEST_SCRIPT && name.startsWith(TEST_SCRIPT),
  );
}

export function testScriptCommands(scripts: Scripts): string[] {
  return [TEST_SCRIPT, ...otherTestScriptNames(scripts)].flatMap((name) =>
    expandedCommands(scripts, name),
  );
}

export function manifestScripts(manifest: unknown): Scripts {
  return fieldsOf(fieldOf(manifest, 'scripts'));
}

export function scriptCommand(scripts: Scripts, runner: string): string | undefined {
  for (const name of [TEST_SCRIPT, ...otherTestScriptNames(scripts)]) {
    const command = expandedCommands(scripts, name).find(
      (candidate) => parseTestCommand(candidate, runner) !== undefined,
    );
    if (command !== undefined) {
      return command;
    }
  }
  return undefined;
}

function scriptCandidates(scripts: Scripts, name: string): RunnerEvidence[] {
  return expandedCommands(scripts, name).flatMap((command) =>
    commandRunners(command).map((runner) => ({
      runner,
      evidence: `package.json script "${name}"`,
      command,
    })),
  );
}

export function scriptEvidence(scripts: Scripts, names: readonly string[]): RunnerEvidence[] {
  return names.flatMap((name) => scriptCandidates(scripts, name));
}
