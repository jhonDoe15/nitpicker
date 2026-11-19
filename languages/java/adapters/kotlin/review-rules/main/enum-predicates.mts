import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { PredicateComparison, PredicateFact } from '../typed/kotlin-flow-types.mts';
import type { ReviewFinding, RuleOptions } from '../typed/review-finding-types.mts';
import {
  ENUM_PREDICATE_RULE,
  readEnums as untypedReadEnums,
} from '../../../review-rules/enum-predicates.mts';

type EnumDeclaration = { packageName: string; constants: string[] };
type EnumIndex = Map<string, EnumDeclaration[]>;
type Reference = { type: string; constant: string };
type Constant = Reference & { declared: EnumDeclaration };
type Operand = Constant & { subject?: string };

const readEnums: (projectRoot: string) => EnumIndex = untypedReadEnums;

const MESSAGE = `These comparisons list only some entries of {type}, so an entry added later silently falls into the other case. Classify every entry: a \`when\` without \`else\` (adding an entry then fails to compile), or a Boolean each entry declares (PAID(true)).`;
const MINIMUM_ENTRIES = 3;
const ENUM_OFFSET = 2;
const MINIMUM_ELEMENTS = 2;
const QUALIFIED = /^(?:\w+\.)*([A-Z]\w*)\.(\w+|`[^`]+`)$/u;
const BARE = /^(?:\w+|`[^`]+`)$/u;
const BACKTICKS = /^`(.*)`$/u;
const HOLDERS = new Set(['return', 'variable', 'lambda', 'assign']);

function kotlinEnums(files: KotlinFile[]): EnumIndex {
  const enums: EnumIndex = new Map();
  for (const file of files) {
    for (const declared of file.classes.filter(({ kind }) => kind === 'enum')) {
      const list = enums.get(declared.name) ?? [];
      list.push({ packageName: file.package, constants: declared.entries ?? [] });
      enums.set(declared.name, list);
    }
  }
  return enums;
}

function allEnums(files: KotlinFile[], projectRoot: string): EnumIndex {
  const enums = kotlinEnums(files);
  for (const [name, declared] of readEnums(projectRoot)) {
    enums.set(name, [...(enums.get(name) ?? []), ...declared]);
  }
  return enums;
}

function constantsKey(declared: EnumDeclaration | undefined): string {
  return [...(declared?.constants ?? [])].toSorted().join(',');
}

function declarationFor(
  enums: EnumIndex,
  file: KotlinFile,
  name: string,
): EnumDeclaration | undefined {
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

function importedConstant(text: string, file: KotlinFile, enums: EnumIndex): Reference | undefined {
  const single = file.imports.find(({ path, all }) => !all && path.endsWith(`.${text}`));
  if (single !== undefined) {
    const parts = single.path.split('.');
    const type = parts.at(-ENUM_OFFSET);
    return type === undefined ? undefined : { type, constant: text };
  }
  const owners = file.imports
    .filter(({ all }) => all)
    .map(({ path }) => path.split('.').at(-1))
    .filter(
      (type) =>
        type !== undefined &&
        (enums.get(type) ?? []).some(({ constants }) => constants.includes(text)),
    );
  const [owner] = owners;
  return owners.length === 1 && owner !== undefined ? { type: owner, constant: text } : undefined;
}

function unquoted(name: string): string {
  return name.replace(BACKTICKS, '$1');
}

function referenceOf(text: string, file: KotlinFile, enums: EnumIndex): Reference | undefined {
  const [, type, constant] = QUALIFIED.exec(text) ?? [];
  if (type !== undefined && constant !== undefined) {
    return { type, constant: unquoted(constant) };
  }
  return BARE.test(text) ? importedConstant(unquoted(text), file, enums) : undefined;
}

function constantOf(text: string, file: KotlinFile, enums: EnumIndex): Constant | undefined {
  const found = referenceOf(text, file, enums);
  const declared = found && declarationFor(enums, file, found.type);
  return found !== undefined && declared?.constants.includes(found.constant) === true
    ? { ...found, declared }
    : undefined;
}

function chainOperand(
  comparison: PredicateComparison,
  file: KotlinFile,
  enums: EnumIndex,
): Operand | undefined {
  const left = constantOf(comparison.left, file, enums);
  const right = constantOf(comparison.right, file, enums);
  if (left && !right && comparison.rightStable) {
    return { ...left, subject: comparison.right };
  }
  return right && !left && comparison.leftStable
    ? { ...right, subject: comparison.left }
    : undefined;
}

function partialType(candidates: (Operand | undefined)[]): string | undefined {
  const operands = candidates.filter((operand) => operand !== undefined);
  if (operands.length < MINIMUM_ELEMENTS || operands.length !== candidates.length) {
    return undefined;
  }
  const [first] = operands;
  if (first === undefined) {
    return undefined;
  }
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

function predicateType(
  predicate: PredicateFact,
  file: KotlinFile,
  enums: EnumIndex,
): string | undefined {
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

export function enumMessage(type: string): string {
  return MESSAGE.replace('{type}', type);
}

export function enumPredicateFindings(
  files: KotlinFile[],
  { projectRoot, finding, declaredIn = files }: RuleOptions & { projectRoot: string },
): ReviewFinding[] {
  const main = files.filter(({ test }) => !test);
  if (!main.some((file) => (file.predicates ?? []).length > 0)) {
    return [];
  }
  const enums = allEnums(declaredIn, projectRoot);
  return main.flatMap((file) =>
    (file.predicates ?? []).flatMap((predicate) => {
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
