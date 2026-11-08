import {
  cycleText,
  memberCycles,
} from '../../../../../../../shared/rules/generated-members/member-cycles.mjs';
import { kotlinClasses, kotlinTypeReferences, resolveKotlinClass } from './kotlin-types.mjs';

export const MEMBER_CYCLE_RULE = 'GeneratedMemberCycle';
export const SKIPPED_SUPER_RULE = 'GeneratedEqualsSkipsSuperclass';
const MAX_SUPERCLASSES = 10;
const MEMBERS = {
  toString: { label: 'toString', declared: [['toString', 0]] },
  equals: {
    label: 'equals and hashCode',
    declared: [
      ['equals', 1],
      ['hashCode', 0],
    ],
  },
};

function cycleMessage({ owner, field, cycle, labels }) {
  return [
    `The generated ${labels.join(', ')} of data class \`${owner}\` can follow \`${field}\` around the cycle ${cycle},`,
    'so the first log line, HashSet or cache lookup of an object in the cycle recurses until StackOverflowError.',
    `Move the back reference out of the primary constructor into the class body (\`var ${field}: ... = null\`),`,
    'where the generated members do not read it. A property that only ever points down a tree, never back up, is the intended case.',
  ].join(' ');
}

function superMessage({ owner, parent, names }) {
  return [
    `Data class \`${owner}\` extends \`${parent}\`, which declares ${names.map((name) => `\`${name}\``).join(', ')},`,
    `but the generated equals and hashCode read only the primary-constructor properties of \`${owner}\`,`,
    'so two objects that differ only in inherited properties are equal.',
    `Declare them abstract in \`${parent}\` and override them in the primary constructor, or write equals and hashCode.`,
  ].join(' ');
}

function isProperty(parameter) {
  return typeof parameter.property === 'string';
}

function ownFunctions(entry) {
  return entry.file.functions.filter(({ owner }) => owner === entry.klass.qualified);
}

function declaresAll(entry, declared) {
  const functions = ownFunctions(entry);
  return declared.every(([name, count]) =>
    functions.some((fn) => fn.name === name && fn.parameters.length === count),
  );
}

function generatedFor(classes, kind) {
  return new Map(
    [...classes].filter(
      ([, entry]) => entry.klass.data === true && !declaresAll(entry, MEMBERS[kind].declared),
    ),
  );
}

function memberEdges(classes, kind) {
  const generated = generatedFor(classes, kind);
  return [...generated.values()].flatMap(({ klass, file, qualified }) =>
    klass.primaryParameters.filter(isProperty).flatMap((parameter) =>
      kotlinTypeReferences(parameter.type).flatMap(({ name, many }) => {
        const target = resolveKotlinClass(name, { classes, file, owner: klass.qualified });
        return target === undefined || !generated.has(target)
          ? []
          : [
              {
                from: qualified,
                to: target,
                fromName: klass.qualified,
                toName: generated.get(target).klass.qualified,
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

function cycleFindings(classes, ownFiles, finding) {
  const closing = new Map();
  for (const kind of Object.keys(MEMBERS)) {
    for (const { edge, cycle } of memberCycles(memberEdges(classes, kind))) {
      const key = `${edge.file}\0${String(edge.line)}\0${edge.field}`;
      const found = closing.get(key) ?? { edge, cycle, labels: [] };
      closing.set(key, { ...found, labels: [...found.labels, MEMBERS[kind].label] });
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

function stateOf(entry) {
  const owned = entry.file.properties.filter(
    (property) =>
      property.owner === entry.klass.qualified &&
      property.abstract !== true &&
      property.computed !== true &&
      property.delegated !== true,
  );
  return [...entry.klass.primaryParameters.filter(isProperty), ...owned].map(({ name }) => name);
}

function finalEquals(entry) {
  return ownFunctions(entry).some(
    (fn) => fn.name === 'equals' && (fn.modifiers ?? []).includes('final'),
  );
}

function inheritedState(classes, entry) {
  const overridden = new Set(entry.klass.primaryParameters.filter(isProperty).map(({ name }) => name));
  const found = [];
  let current = entry;
  for (let depth = 0; depth < MAX_SUPERCLASSES; depth += 1) {
    const parentName =
      current.klass.superClass === undefined || current.klass.superClass === null
        ? undefined
        : resolveKotlinClass(current.klass.superClass, {
            classes,
            file: current.file,
            owner: current.klass.qualified,
          });
    const parent = parentName === undefined ? undefined : classes.get(parentName);
    if (parent === undefined || finalEquals(parent)) {
      return found;
    }
    const names = stateOf(parent).filter((name) => !overridden.has(name));
    found.push(...names.map((name) => ({ name, parent })));
    current = parent;
  }
  return found;
}

function superFindings(classes, own, finding) {
  return own.flatMap((file) =>
    file.classes
      .filter((klass) => klass.data === true && !klass.local)
      .flatMap((klass) => {
        const entry = { klass, file };
        const inherited = declaresAll(entry, MEMBERS.equals.declared)
          ? []
          : inheritedState(classes, entry);
        if (inherited.length === 0) {
          return [];
        }
        const parent = inherited[0].parent.klass.qualified;
        const names = inherited.filter((item) => item.parent === inherited[0].parent);
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

export function generatedMemberFindings(own, { finding, declaredIn = own }) {
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
