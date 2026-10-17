import { commandRunners, parseTestCommand } from '../script-command.mjs';

const SEGMENT_START = String.raw`(?<=^|&&|\|\||;)\s*`;
const SEGMENT_END = String.raw`\s*(?=$|&&|\|\||;)`;
const PACKAGE_MANAGER_RUN = String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run(?:-script)?\s+)?`;
const SCRIPT_NAME = String.raw`(?<name>[\w:.-]+)`;
const FORWARDED_ARGUMENTS = String.raw`(?:\s+--(?<rest>(?:\s+[^\s&;|]+)*))?`;
const SCRIPT_REFERENCE = new RegExp(
  `${SEGMENT_START}${PACKAGE_MANAGER_RUN}${SCRIPT_NAME}${FORWARDED_ARGUMENTS}${SEGMENT_END}`,
  'gu',
);

export const TEST_SCRIPT = 'test';

function textBefore(command, index) {
  const before = command.slice(0, index).trimEnd();
  return before === '' ? '' : `${before} `;
}

function scriptReferences(command) {
  return [...command.matchAll(SCRIPT_REFERENCE)].map((match) => ({
    name: match.groups.name,
    prefix: textBefore(command, match.index),
    rest: (match.groups.rest ?? '').trimEnd(),
  }));
}

function expandedCommands(scripts, name) {
  const pending = [{ name, prefix: '', suffix: '' }];
  const seen = new Set([name]);
  const commands = [];
  for (const current of pending) {
    const command = scripts[current.name];
    if (typeof command !== 'string') {
      continue;
    }
    commands.push(`${current.prefix}${command}${current.suffix}`);
    const references = scriptReferences(command).filter((reference) => !seen.has(reference.name));
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

export function otherTestScriptNames(scripts) {
  return Object.keys(scripts).filter(
    (name) => name !== TEST_SCRIPT && name.startsWith(TEST_SCRIPT),
  );
}

export function manifestScripts(manifest) {
  const scripts = manifest?.scripts;
  return typeof scripts === 'object' && scripts !== null ? scripts : {};
}

export function scriptCommand(scripts, runner) {
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

function scriptCandidates(scripts, name) {
  return expandedCommands(scripts, name).flatMap((command) =>
    commandRunners(command).map((runner) => ({
      runner,
      evidence: `package.json script "${name}"`,
      command,
    })),
  );
}

export function scriptEvidence(scripts, names) {
  return names.flatMap((name) => scriptCandidates(scripts, name));
}
