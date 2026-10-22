import { MESSAGES, renderMessage } from '../../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../../shared/rules/exceptions.mjs';
import { UNUSED_API_RULE_IDS } from '../../../../../../shared/unused-api/unused-api-policy.mjs';
import { append } from '../kotlin-facts.mjs';
import { optionUnits } from './unused-option-units.mjs';

export const UNUSED_OPTION_RULE = UNUSED_API_RULE_IDS.unusedOption;
export const UNUSED_OPTION_TOOL = 'structure';

const SCOPES = {
  limited: 'private or internal, so calls in tests count',
  production: 'tests do not count',
  published: 'tests of this published module count',
};
const NULLABLE = /\?$/u;
const COPY = 'copy';

function typeAliases(files) {
  return new Map(
    files.flatMap(({ typeAliases: declared = [] }) =>
      declared.map(({ name, target }) => [name, target.replace(NULLABLE, '').split('.').at(-1)]),
    ),
  );
}

function callsByName(files) {
  const calls = new Map();
  const targets = typeAliases(files);
  for (const file of files) {
    const aliases = new Map(
      file.imports
        .filter(({ alias }) => alias !== undefined)
        .map(({ alias, path }) => [alias, path.split('.').at(-1)]),
    );
    for (const call of file.calls) {
      const name = aliases.get(call.name) ?? targets.get(call.name) ?? call.name;
      append(calls, name, call);
    }
  }
  return calls;
}

function referencedNames(files) {
  return new Set(files.flatMap((file) => file.references));
}

function isCompatible(call, unit) {
  const names = new Set(unit.parameters.map(({ name }) => name));
  return (
    call.positional + call.named.length + (call.lambda ? 1 : 0) <= unit.parameters.length &&
    call.named.every((name) => names.has(name))
  );
}

function fills(call, { parameter, index, last }) {
  return (
    call.spread ||
    call.named.includes(parameter.name) ||
    call.positional > index ||
    (call.lambda && index === last)
  );
}

function unusedParameters(unit, calls, copies) {
  const constructed = calls.filter((call) => isCompatible(call, unit));
  if (constructed.length === 0) {
    return [];
  }
  const compatible = [
    ...constructed,
    ...(unit.data ? copies.filter((call) => isCompatible(call, unit)) : []),
  ];
  return unit.parameters
    .map((parameter, index) => ({ parameter, index, last: unit.parameters.length - 1 }))
    .filter(
      (slot) =>
        slot.parameter.default &&
        !slot.parameter.vararg &&
        !compatible.some((call) => fills(call, slot)),
    )
    .map(({ parameter }) => parameter);
}

function callerView(own, { projectFiles = own, published = false }) {
  const production = projectFiles.filter(({ test }) => !test);
  const ownTests = published ? own.filter(({ test }) => test) : [];
  return {
    limited: callsByName(own),
    open: callsByName([...production, ...ownTests]),
    scope: published ? SCOPES.published : SCOPES.production,
    references: referencedNames(projectFiles),
  };
}

export function unusedOptionFindings(files, options) {
  const { finding, mentionedInJava, serialization = false } = options;
  const view = callerView(files, options);
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => optionUnits(file, serialization))
    .filter((unit) => !view.references.has(unit.callee))
    .flatMap((unit) => {
      const calls = unit.limited ? view.limited : view.open;
      const unused = unusedParameters(unit, calls.get(unit.callee) ?? [], calls.get(COPY) ?? []);
      if (unused.length === 0 || mentionedInJava(unit.callee)) {
        return [];
      }
      return unused.map((parameter) => {
        const symbol = `${unit.label}.${parameter.name}`;
        return finding({
          tool: UNUSED_OPTION_TOOL,
          rule: UNUSED_OPTION_RULE,
          file: unit.file,
          line: parameter.line,
          symbol,
          message: renderMessage(MESSAGES.unusedOption, {
            name: symbol,
            scope: unit.limited ? SCOPES.limited : view.scope,
            exception: exceptionText(UNUSED_OPTION_RULE, unit.file),
          }),
        });
      });
    });
}
