import { compactType } from '../kotlin-facts.mjs';
import { memberAliasFinding } from '../../../review-rules/forwarding/alias-findings.mjs';

const SKIPPED_NAMES = new Set(['of', 'from', 'valueOf', 'fromString', 'invoke', 'copy']);
const SKIPPED_MODIFIERS = new Set([
  'override',
  'open',
  'abstract',
  'operator',
  'infix',
  'inline',
  'suspend',
  'actual',
  'expect',
]);

function plain(fn) {
  return (
    !fn.local &&
    fn.hasBody &&
    fn.receiver === undefined &&
    !fn.typeParameters &&
    !fn.context &&
    fn.annotations.length === 0 &&
    !SKIPPED_NAMES.has(fn.name) &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.parameters.every(
      (p) => !p.vararg && !p.default && p.annotations.length === 0 && compactType(p.type) !== '',
    )
  );
}

function sameContract(fn, target) {
  const returned = compactType(target.returnType);
  const inferredReturn = fn.expressionBody === true ? returned : 'Unit';
  const ownReturn = fn.returnType === undefined ? inferredReturn : compactType(fn.returnType);
  return (
    returned !== '' &&
    ownReturn === returned &&
    fn.parameters.length === target.parameters.length &&
    fn.parameters.every(
      (p, index) =>
        p.name === target.parameters[index].name &&
        compactType(p.type) === compactType(target.parameters[index].type),
    )
  );
}

function unchanged(fn) {
  const call = fn.forward;
  return (
    call !== undefined &&
    !call.typeArguments &&
    call.name !== fn.name &&
    (call.qualifier === undefined || call.qualifier === 'this') &&
    !(call.qualifier === undefined && fn.parameters.some((p) => p.name === call.name)) &&
    call.arguments.length === fn.parameters.length &&
    call.arguments.every(
      (arg, index) =>
        !arg.spread &&
        !arg.lambda &&
        arg.text === fn.parameters[index].name &&
        (arg.name === undefined || arg.name === fn.parameters[index].name),
    )
  );
}

function targetOf(fn, file) {
  const methods = file.functions.filter((other) => other.owner === fn.owner && !other.local);
  const targets = methods.filter((other) => other.name === fn.forward.name);
  if (
    targets.length !== 1 ||
    methods.filter((other) => other.name === fn.name).length !== 1 ||
    file.properties.some(
      (property) => property.owner === fn.owner && property.name === fn.forward.name,
    )
  ) {
    return undefined;
  }
  const [target] = targets;
  return plain(target) && sameContract(fn, target) ? target : undefined;
}

export function memberAliasFindings(files) {
  return files
    .filter((file) => !file.test)
    .flatMap((file) =>
      file.functions.flatMap((fn) => {
        const owner = file.classes.find((klass) => klass.qualified === fn.owner);
        if (
          owner === undefined ||
          owner.supers.length > 0 ||
          owner.annotations.length > 0 ||
          owner.open ||
          !['class', 'object', 'companion'].includes(owner.kind) ||
          !plain(fn) ||
          !unchanged(fn) ||
          (owner.kind !== 'class' && fn.forward.qualifier !== 'this') ||
          targetOf(fn, file) === undefined
        ) {
          return [];
        }
        return [
          memberAliasFinding({
            file: file.file,
            symbol: `${fn.owner}.${fn.name}`,
            target: `${fn.owner}.${fn.forward.name}`,
            line: fn.line,
          }),
        ];
      }),
    );
}
