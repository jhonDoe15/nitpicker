import { ENUM_PREDICATE_RULE, readEnums } from '../../../review-rules/enum-predicates.mjs';
import { exceptionSentence } from '../review-finding.mjs';

const MESSAGE = `These comparisons list only some entries of {type}, so an entry added later silently falls into the other case. Classify every entry: a \`when\` without \`else\` (adding an entry then fails to compile), or a Boolean each entry declares (PAID(true)). If a partial test is intended, ${exceptionSentence(ENUM_PREDICATE_RULE)}`;
const MINIMUM_ENTRIES = 3;
const ENUM_OFFSET = 2;
const MINIMUM_ELEMENTS = 2;
const QUALIFIED = /^(?:\w+\.)*([A-Z]\w*)\.(\w+)$/u;
const BARE = /^\w+$/u;
const HOLDERS = new Set(['return', 'variable', 'lambda', 'assign']);

function kotlinEnums(files) {
  const enums = new Map();
  for (const file of files) {
    for (const declared of file.classes.filter(({ kind }) => kind === 'enum')) {
      const list = enums.get(declared.name) ?? [];
      list.push({ packageName: file.package, constants: declared.entries });
      enums.set(declared.name, list);
    }
  }
  return enums;
}

function allEnums(files, projectRoot) {
  const enums = kotlinEnums(files);
  for (const [name, declared] of readEnums(projectRoot)) {
    enums.set(name, [...(enums.get(name) ?? []), ...declared]);
  }
  return enums;
}

function constantsKey(declared) {
  return [...declared.constants].toSorted().join(',');
}

function declarationFor(enums, file, name) {
  const declarations = enums.get(name);
  if (declarations === undefined) {
    return undefined;
  }
  const imported = file.imports.filter(({ path }) => path.endsWith(`.${name}`));
  const visible = declarations.filter(
    ({ packageName }) =>
      packageName === file.package ||
      imported.some(({ path }) => path.startsWith(`${packageName}.`)) ||
      file.imports.some(({ all, path }) => all && path === packageName),
  );
  const [first] = visible.length > 0 ? visible : declarations;
  return (visible.length > 0 ? visible : declarations).every(
    (declared) => constantsKey(declared) === constantsKey(first),
  )
    ? first
    : undefined;
}

function importedConstant(text, file, enums) {
  const single = file.imports.find(({ path, all }) => !all && path.endsWith(`.${text}`));
  if (single !== undefined) {
    const parts = single.path.split('.');
    return { type: parts.at(-ENUM_OFFSET), constant: text };
  }
  const owners = file.imports
    .filter(({ all }) => all)
    .map(({ path }) => path.split('.').at(-1))
    .filter((type) => (enums.get(type) ?? []).some(({ constants }) => constants.includes(text)));
  return owners.length === 1 ? { type: owners[0], constant: text } : undefined;
}

function referenceOf(text, file, enums) {
  const qualified = QUALIFIED.exec(text);
  if (qualified) {
    return { type: qualified[1], constant: qualified[2] };
  }
  return BARE.test(text) ? importedConstant(text, file, enums) : undefined;
}

function constantOf(text, file, enums) {
  const found = referenceOf(text, file, enums);
  const declared = found && declarationFor(enums, file, found.type);
  return declared?.constants.includes(found.constant) ? { ...found, declared } : undefined;
}

function chainOperand(comparison, file, enums) {
  const left = constantOf(comparison.left, file, enums);
  const right = constantOf(comparison.right, file, enums);
  if (left && !right && comparison.rightStable) {
    return { ...left, subject: comparison.right };
  }
  return right && !left && comparison.leftStable
    ? { ...right, subject: comparison.left }
    : undefined;
}

function partialType(operands) {
  if (operands.length < MINIMUM_ELEMENTS || operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  const [first] = operands;
  const constants = new Set(operands.map(({ constant }) => constant));
  const consistent = operands.every(
    ({ type, subject }) =>
      type === first.type && (subject === undefined || subject === first.subject),
  );
  return consistent &&
    constants.size === operands.length &&
    first.declared.constants.length >= MINIMUM_ENTRIES &&
    constants.size < first.declared.constants.length
    ? first.type
    : undefined;
}

function predicateType(predicate, file, enums) {
  if (!HOLDERS.has(predicate.holder)) {
    return undefined;
  }
  if (predicate.kind === 'chain') {
    return partialType(predicate.comparisons.map((entry) => chainOperand(entry, file, enums)));
  }
  const elements = predicate.elements.map((text) => constantOf(text, file, enums));
  const subjectIsConstant = constantOf(predicate.subject, file, enums) !== undefined;
  return predicate.subjectStable && !subjectIsConstant
    ? partialType(elements.map((element) => element && { ...element, subject: predicate.subject }))
    : undefined;
}

export function enumMessage(type) {
  return MESSAGE.replace('{type}', type);
}

export function enumPredicateFindings(files, { projectRoot, finding, declaredIn = files }) {
  const main = files.filter(({ test }) => !test);
  if (!main.some((file) => file.predicates.length > 0)) {
    return [];
  }
  const enums = allEnums(declaredIn, projectRoot);
  return main.flatMap((file) =>
    file.predicates.flatMap((predicate) => {
      const type = predicateType(predicate, file, enums);
      return type === undefined
        ? []
        : [
            finding({
              rule: ENUM_PREDICATE_RULE,
              file: file.file,
              line: predicate.line,
              symbol: predicate.symbol,
              key: `${predicate.symbol}:${type}`,
              message: enumMessage(type),
            }),
          ];
    }),
  );
}
