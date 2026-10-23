import { MESSAGES, renderMessage } from '../../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../../shared/rules/exceptions.mjs';
import {
  UNUSED_API_RULE_IDS,
  UNUSED_OPTION_SCOPES,
} from '../../../../../../shared/unused-api/unused-api-policy.mjs';
import { append } from '../kotlin-facts.mjs';
import { limitedUnits, publicFunctionUnits } from './unused-option-units.mjs';

export const UNUSED_OPTION_RULE = UNUSED_API_RULE_IDS.unusedOption;
export const UNUSED_OPTION_TOOL = 'structure';

const SCOPES = UNUSED_OPTION_SCOPES.kotlin;
const NOTE_SYMBOL = 'callers-not-analyzed';
const LISTED_GAPS = 5;
const NULLABLE = /\?$/u;
const COPY = 'copy';

function typeAliases(files) {
  return new Map(
    files.flatMap(({ typeAliases: declared = [] }) =>
      declared.map(({ name, target }) => [name, target.replace(NULLABLE, '').split('.').at(-1)]),
    ),
  );
}

function callsByName(files, { aliases: withTypeAliases = true } = {}) {
  const calls = new Map();
  const targets = withTypeAliases ? typeAliases(files) : new Map();
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

function optionFinding({ finding, scope }, unit, parameter) {
  const symbol = `${unit.label}.${parameter.name}`;
  return finding({
    tool: UNUSED_OPTION_TOOL,
    rule: UNUSED_OPTION_RULE,
    file: unit.file,
    line: parameter.line,
    symbol,
    message: renderMessage(MESSAGES.unusedOption, {
      name: symbol,
      scope,
      exception: exceptionText(UNUSED_OPTION_RULE, unit.file),
    }),
  });
}

function judge(units, { calls, references, mentionedInJava, finding, scope }) {
  return units
    .filter((unit) => !references.has(unit.callee))
    .flatMap((unit) => {
      const unused = unusedParameters(unit, calls(unit.callee), calls(COPY));
      if (unused.length === 0 || mentionedInJava(unit.callee)) {
        return [];
      }
      return unused.map((parameter) => optionFinding({ finding, scope }, unit, parameter));
    });
}

function gapNote(unit, build, finding) {
  if (build.notes.has(UNUSED_OPTION_RULE)) {
    return [];
  }
  build.notes.add(UNUSED_OPTION_RULE);
  const listed = build.gaps.slice(0, LISTED_GAPS).join(', ');
  const more =
    build.gaps.length > LISTED_GAPS ? ` and ${String(build.gaps.length - LISTED_GAPS)} more` : '';
  const note = finding({
    tool: UNUSED_OPTION_TOOL,
    rule: UNUSED_OPTION_RULE,
    file: unit.file,
    line: unit.line,
    symbol: NOTE_SYMBOL,
    message: '',
  });
  return [
    {
      ...note,
      message:
        'Public functions are not checked for unused options: the facts do not cover ' +
        `${listed}${more}, so calls there are not seen.`,
      classification: 'descriptive',
    },
  ];
}

function publicFindings(own, { build, published = false, finding }) {
  const units = own.filter(({ test }) => !test).flatMap(publicFunctionUnits);
  if (units.length === 0 || build === undefined) {
    return [];
  }
  if (build.gaps.length > 0) {
    return gapNote(units[0], build, finding);
  }
  const production = build.memo('unused-option-calls', () =>
    callsByName(
      build.files.filter(({ test }) => !test),
      { aliases: false },
    ),
  );
  const tests = published
    ? callsByName(
        own.filter(({ test }) => test),
        { aliases: false },
      )
    : new Map();
  return judge(units, {
    calls: (name) => [...(production.get(name) ?? []), ...(tests.get(name) ?? [])],
    references: build.memo('unused-option-references', () => referencedNames(build.files)),
    mentionedInJava: build.mentionedInJava,
    finding,
    scope: published ? SCOPES.published : SCOPES.private,
  });
}

export function unusedOptionFindings(files, options) {
  const { finding, mentionedInJava, serialization = false } = options;
  const calls = callsByName(files);
  const limited = judge(
    files.filter(({ test }) => !test).flatMap((file) => limitedUnits(file, serialization)),
    {
      calls: (name) => calls.get(name) ?? [],
      references: referencedNames(files),
      mentionedInJava,
      finding,
      scope: SCOPES.local,
    },
  );
  return [...limited, ...publicFindings(files, options)];
}
