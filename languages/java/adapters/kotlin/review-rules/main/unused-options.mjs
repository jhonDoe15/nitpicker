import { MESSAGES, renderMessage } from '../../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../../shared/rules/exceptions.mjs';
import { UNUSED_API_RULE_IDS } from '../../../../../../shared/unused-api/unused-api-policy.mjs';

export const UNUSED_OPTION_RULE = UNUSED_API_RULE_IDS.unusedOption;
export const UNUSED_OPTION_TOOL = 'structure';

const SCOPE = 'private and internal declarations only; calls in tests count';
const LIMITED = new Set(['private', 'internal']);
const SKIPPED_MODIFIERS = new Set([
  'override',
  'open',
  'abstract',
  'operator',
  'infix',
  'actual',
  'expect',
]);
const CONSTRUCTOR = '<init>';
const CALLABLE_KINDS = new Set(['class']);

function hasOptions(parameters) {
  return parameters.some(({ default: hasDefault, vararg }) => hasDefault && !vararg);
}

function functionUnits(file, classes) {
  return file.functions
    .filter((fn) => {
      const owner = classes.get(fn.owner);
      return (
        fn.name !== CONSTRUCTOR &&
        fn.name !== 'main' &&
        LIMITED.has(fn.visibility) &&
        fn.annotations.length === 0 &&
        !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
        fn.owner !== '<anonymous>' &&
        owner?.kind !== 'interface' &&
        hasOptions(fn.parameters)
      );
    })
    .map((fn) => ({
      file: file.file,
      callee: fn.name,
      label: [fn.owner, fn.name].filter(Boolean).join('.'),
      parameters: fn.parameters,
      line: fn.line,
    }));
}

function eligibleClass(klass) {
  return (
    CALLABLE_KINDS.has(klass.kind) && !klass.local && !klass.open && klass.annotations.length === 0
  );
}

function constructorUnits(file, classes) {
  const primary = file.classes
    .filter(
      (klass) =>
        eligibleClass(klass) &&
        (LIMITED.has(klass.visibility) || LIMITED.has(klass.constructorVisibility)) &&
        hasOptions(klass.primaryParameters),
    )
    .map((klass) => ({
      file: file.file,
      callee: klass.name,
      label: klass.qualified,
      parameters: klass.primaryParameters,
      line: klass.line,
    }));
  const secondary = file.functions
    .filter(
      (fn) => fn.name === CONSTRUCTOR && LIMITED.has(fn.visibility) && hasOptions(fn.parameters),
    )
    .filter((fn) => classes.has(fn.owner) && eligibleClass(classes.get(fn.owner)))
    .map((fn) => ({
      file: file.file,
      callee: classes.get(fn.owner).name,
      label: fn.owner,
      parameters: fn.parameters,
      line: fn.line,
    }));
  return [...primary, ...secondary];
}

function callsByName(files) {
  const calls = new Map();
  for (const file of files) {
    const aliases = new Map(
      file.imports
        .filter(({ alias }) => alias !== undefined)
        .map(({ alias, path }) => [alias, path.split('.').at(-1)]),
    );
    for (const call of file.calls) {
      const name = aliases.get(call.name) ?? call.name;
      calls.set(name, [...(calls.get(name) ?? []), call]);
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

function unusedParameters(unit, calls) {
  const compatible = calls.filter((call) => isCompatible(call, unit));
  if (compatible.length === 0) {
    return [];
  }
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

export function unusedOptionFindings(files, { finding, mentionedInJava }) {
  const main = files.filter(({ test }) => !test);
  const calls = callsByName(files);
  const references = referencedNames(files);
  return main.flatMap((file) => {
    const classes = new Map(file.classes.map((klass) => [klass.qualified, klass]));
    return [...functionUnits(file, classes), ...constructorUnits(file, classes)]
      .filter((unit) => !references.has(unit.callee) && !mentionedInJava(unit.callee))
      .flatMap((unit) =>
        unusedParameters(unit, calls.get(unit.callee) ?? []).map((parameter) => {
          const symbol = `${unit.label}.${parameter.name}`;
          return finding({
            tool: UNUSED_OPTION_TOOL,
            rule: UNUSED_OPTION_RULE,
            file: unit.file,
            line: parameter.line,
            symbol,
            message: renderMessage(MESSAGES.unusedOption, {
              name: symbol,
              scope: SCOPE,
              exception: exceptionText(UNUSED_OPTION_RULE, unit.file),
            }),
          });
        }),
      );
  });
}
