import { MESSAGES, renderMessage } from '../../../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../../../shared/rules/exceptions.mjs';
import {
  UNUSED_API_RULE_IDS,
  UNUSED_OPTION_SCOPES,
} from '../../../../../../../shared/unused-api/unused-api-policy.mjs';
import { append } from '../../kotlin-facts.mjs';
import { declaredNames } from '../../spring/spring-names.mjs';
import { callerNote, hiddenCallers } from './unused-option-gaps.mjs';
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

function noteFinding(note, finding) {
  const listed = note.gaps.slice(0, LISTED_GAPS).join(', ');
  const extra = note.gaps.length - LISTED_GAPS;
  const more = extra > 0 ? ` and ${String(extra)} more` : '';
  const anchor = finding({
    tool: UNUSED_OPTION_TOOL,
    rule: UNUSED_OPTION_RULE,
    file: note.unit.file,
    line: note.unit.line,
    symbol: NOTE_SYMBOL,
    message: '',
  });
  return {
    ...anchor,
    message:
      'Public functions are not checked for unused options where these can call them: the facts ' +
      `do not cover ${listed}${more}.`,
    classification: 'descriptive',
  };
}

function publicFindings(own, { build, reportRoot, finding }) {
  const module = build?.modules.find((entry) => entry.reportRoot === reportRoot);
  if (module === undefined) {
    return [];
  }
  if (hiddenCallers(build, module).length > 0) {
    const note = callerNote(build);
    return note?.reportRoot === reportRoot ? [noteFinding(note, finding)] : [];
  }
  const declared = build.memo('unused-option-declared', () => declaredNames(build.files));
  const units = own
    .filter(({ test }) => !test)
    .flatMap((file) => publicFunctionUnits(file, declared));
  const production = build.memo('unused-option-calls', () =>
    callsByName(
      build.files.filter(({ test }) => !test),
      { aliases: false },
    ),
  );
  const published = module.manifest.published === true;
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
