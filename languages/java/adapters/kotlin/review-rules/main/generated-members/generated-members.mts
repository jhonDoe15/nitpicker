import type {
  ClassFact,
  FunctionFact,
  KotlinFile,
  ParameterFact,
} from '../../typed/kotlin-fact-types.mts';
import type {
  FindingFactory,
  ReviewFinding,
  RuleOptions,
} from '../../typed/review-finding-types.mts';
import {
  cycleText as untypedCycleText,
  memberCycles as untypedMemberCycles,
} from '../../../../../../../shared/rules/generated-members/member-cycles.mjs';
import {
  MEMBER_CYCLE_RULE,
  SKIPPED_SUPER_RULE,
} from '../../../../../messages/generated-members/rule-names.mts';
import {
  type ClassEntry,
  type ClassIndex,
  kotlinClasses,
  kotlinTypeReferences,
  resolveKotlinClass,
} from './kotlin-types.mts';
import { appendAll as untypedAppendAll } from '../../../../../../../shared/lists/items.mjs';

export { MEMBER_CYCLE_RULE, SKIPPED_SUPER_RULE };

type MemberEdge = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  field: string;
  file: string;
  line: number;
  many: boolean;
};
type MemberKind = { label: string; declared: [string, number][] };
type EntryLike = { klass: ClassFact; file: KotlinFile };
type Inherited = { name: string; parent: ClassEntry };

const memberCycles: (edges: MemberEdge[]) => { edge: MemberEdge; cycle: unknown }[] =
  untypedMemberCycles;
const cycleText: (cycle: unknown, edge: MemberEdge) => string = untypedCycleText;
const appendAll: <Item>(target: Item[], items: Item[]) => Item[] = untypedAppendAll;

const MAX_SUPERCLASSES = 10;
const MEMBERS: { toString: MemberKind; equals: MemberKind } = {
  toString: { label: 'toString', declared: [['toString', 0]] },
  equals: {
    label: 'equals and hashCode',
    declared: [
      ['equals', 1],
      ['hashCode', 0],
    ],
  },
};

function cycleMessage({
  owner,
  field,
  cycle,
  labels,
}: {
  owner: string;
  field: string;
  cycle: string;
  labels: string[];
}): string {
  return [
    `The generated ${labels.join(', ')} of data class \`${owner}\` can follow \`${field}\` around the cycle ${cycle},`,
    'so the first log line, HashSet or cache lookup of an object in the cycle recurses until StackOverflowError.',
    `Move the back reference out of the primary constructor into the class body (\`var ${field}: ... = null\`),`,
    'where the generated members do not read it. A property that only ever points down a tree, never back up, is the intended case.',
  ].join(' ');
}

function superMessage({
  owner,
  parent,
  names,
}: {
  owner: string;
  parent: string;
  names: string[];
}): string {
  return [
    `Data class \`${owner}\` extends \`${parent}\`, which declares ${names.map((name) => `\`${name}\``).join(', ')},`,
    `but the generated equals and hashCode read only the primary-constructor properties of \`${owner}\`,`,
    'so two objects that differ only in inherited properties are equal.',
    `Declare them abstract in \`${parent}\` and override them in the primary constructor, or write equals and hashCode.`,
  ].join(' ');
}

function isProperty(parameter: ParameterFact): boolean {
  return typeof parameter.property === 'string';
}

function ownFunctions(entry: EntryLike): FunctionFact[] {
  return entry.file.functions.filter(({ owner }) => owner === entry.klass.qualified);
}

function declaresAll(entry: EntryLike, declared: [string, number][]): boolean {
  const functions = ownFunctions(entry);
  return declared.every(([name, count]) =>
    functions.some((fn) => fn.name === name && fn.parameters.length === count),
  );
}

function generatedFor(classes: ClassIndex, kind: MemberKind): ClassIndex {
  return new Map(
    [...classes].filter(([, entry]) => entry.klass.data && !declaresAll(entry, kind.declared)),
  );
}

function memberEdges(classes: ClassIndex, kind: MemberKind): MemberEdge[] {
  const generated = generatedFor(classes, kind);
  return [...generated.values()].flatMap(({ klass, file, qualified }) =>
    klass.primaryParameters.filter(isProperty).flatMap((parameter) =>
      kotlinTypeReferences(parameter.type).flatMap(({ name, many: nested }) => {
        const many = nested || parameter.vararg;
        const target = resolveKotlinClass(name, { classes, file, owner: klass.qualified });
        return target === undefined || !generated.has(target)
          ? []
          : [
              {
                from: qualified,
                to: target,
                fromName: klass.qualified,
                toName: generated.get(target)?.klass.qualified ?? '',
                field: parameter.name,
                file: file.file,
                line: parameter.line,
                many,
              },
            ];
      }),
    ),
  );
}

function cycleFindings(
  classes: ClassIndex,
  ownFiles: Set<string>,
  finding: FindingFactory,
): ReviewFinding[] {
  const closing = new Map<string, { edge: MemberEdge; cycle: unknown; labels: string[] }>();
  for (const kind of Object.values(MEMBERS)) {
    for (const { edge, cycle } of memberCycles(memberEdges(classes, kind))) {
      const key = `${edge.file}\0${String(edge.line)}\0${edge.field}`;
      const found = closing.get(key) ?? { edge, cycle, labels: [] };
      closing.set(key, { ...found, labels: [...found.labels, kind.label] });
    }
  }
  return [...closing.values()]
    .filter(({ edge }) => ownFiles.has(edge.file))
    .map(({ edge, cycle, labels }) =>
      finding({
        rule: MEMBER_CYCLE_RULE,
        file: edge.file,
        line: edge.line,
        symbol: `${edge.fromName}.${edge.field}`,
        message: cycleMessage({
          owner: edge.fromName,
          field: edge.field,
          cycle: cycleText(cycle, edge),
          labels,
        }),
      }),
    );
}

function stateOf(entry: ClassEntry): string[] {
  const owned = entry.file.properties.filter(
    (property) =>
      property.owner === entry.klass.qualified &&
      property.abstract !== true &&
      property.computed !== true &&
      !property.delegated,
  );
  return [...entry.klass.primaryParameters.filter(isProperty), ...owned].map(({ name }) => name);
}

function finalEquals(entry: ClassEntry): boolean {
  return ownFunctions(entry).some((fn) => fn.name === 'equals' && fn.modifiers.includes('final'));
}

function parentOf(classes: ClassIndex, entry: EntryLike): ClassEntry | undefined {
  const { superClass, qualified } = entry.klass;
  if (typeof superClass !== 'string') {
    return undefined;
  }
  const name = resolveKotlinClass(superClass, { classes, file: entry.file, owner: qualified });
  return name === undefined ? undefined : classes.get(name);
}

function inheritedState(classes: ClassIndex, entry: EntryLike): Inherited[] {
  const overridden = new Set(
    entry.klass.primaryParameters.filter(isProperty).map(({ name }) => name),
  );
  const chain: EntryLike[] = [entry];
  const found: Inherited[] = [];
  for (const current of chain) {
    const parent = parentOf(classes, current);
    if (parent === undefined || finalEquals(parent) || chain.length > MAX_SUPERCLASSES) {
      return found;
    }
    const names = stateOf(parent).filter((name) => !overridden.has(name));
    appendAll(
      found,
      names.map((name) => ({ name, parent })),
    );
    chain.push(parent);
  }
  return found;
}

function superFindings(
  classes: ClassIndex,
  own: KotlinFile[],
  finding: FindingFactory,
): ReviewFinding[] {
  return own.flatMap((file) =>
    file.classes
      .filter((klass) => klass.data && !klass.local)
      .flatMap((klass) => {
        const entry: EntryLike = { klass, file };
        const inherited = declaresAll(entry, MEMBERS.equals.declared)
          ? []
          : inheritedState(classes, entry);
        const [first] = inherited;
        if (first === undefined) {
          return [];
        }
        const parent = first.parent.klass.qualified;
        const names = inherited.filter((item) => item.parent === first.parent);
        return [
          finding({
            rule: SKIPPED_SUPER_RULE,
            file: file.file,
            line: klass.line,
            symbol: klass.qualified,
            message: superMessage({
              owner: klass.qualified,
              parent,
              names: names.map(({ name }) => name),
            }),
          }),
        ];
      }),
  );
}

export function generatedMemberFindings(
  own: KotlinFile[],
  { finding, declaredIn = own }: RuleOptions,
): ReviewFinding[] {
  const mainFiles = own.filter(({ test }) => !test);
  if (mainFiles.length === 0) {
    return [];
  }
  const classes = kotlinClasses([...new Set([...own, ...declaredIn])]);
  return [
    ...cycleFindings(classes, new Set(mainFiles.map(({ file }) => file)), finding),
    ...superFindings(classes, mainFiles, finding),
  ];
}
