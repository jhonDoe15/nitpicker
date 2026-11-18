import type {
  HolderScope,
  ProjectFlags,
  ScannedFile,
  SharedHolder,
} from '../typed/report-types.mts';
import type { ClassInfo, Span, TestScanned } from '../typed/discovery-types.mts';
import { groupOf } from '../typed/indexing.mts';

type Mutability = { reassignable: boolean; collection: boolean };
import { classesOf, enclosingClasses, headerBefore } from '../discovery/declarations.mts';
import { enclosingHosts } from '../discovery/hosts.mts';
import { isSpecType, specBodies } from '../discovery/kotest/kotest-specs.mts';
import { lineStartOf, remembered } from '../discovery/text-scan.mts';
import { expressionEnd, imports } from '../setup/start-kinds.mts';

const CLASS_SCOPE = 'class';
const PROPERTY = /(?<![\w.`])(val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([^=\n]+?))?\s*(=|by\b)?/gu;
const COLLECTION_NAMES = [
  'ArrayList',
  'HashMap',
  'HashSet',
  'LinkedHashMap',
  'LinkedHashSet',
  'TreeMap',
  'TreeSet',
  'LinkedList',
  'ArrayDeque',
  'ConcurrentHashMap',
  'ConcurrentLinkedQueue',
  'CopyOnWriteArrayList',
  'StringBuilder',
  'AtomicInteger',
  'AtomicLong',
  'AtomicBoolean',
  'AtomicReference',
  'LongAdder',
].join('|');
const ARRAYS = '(?:Int|Long|Double|Float|Short|Byte|Char|Boolean)?Array';
const MUTABLE_INIT = new RegExp(
  [
    String.raw`^\s*(?:(?:mutable(?:List|Set|Map)|arrayList|hashMap|hashSet|linkedMap|linkedSet|sortedMap|sortedSet`,
    String.raw`|(?:int|long|double|float|short|byte|char|boolean)?[aA]rray)Of(?:\s*<[^=(]*>)?\s*\(`,
    String.raw`|(?:java\.util\.(?:concurrent\.(?:atomic\.)?)?)?(?:${COLLECTION_NAMES}|${ARRAYS})(?:\s*<[^=(]*>)?\s*\()`,
  ].join(''),
  'u',
);
const MUTABLE_TYPE = new RegExp(
  String.raw`^(?:Mutable(?:List|Set|Map|Collection)|${COLLECTION_NAMES}|${ARRAYS})\b`,
  'u',
);
const KEPT_ANNOTATIONS = new Set(['JvmField', 'JvmStatic', 'Volatile']);
const ISOLATING = /\bIsolationMode\s*\.\s*InstancePer(?:Test|Leaf|Root)\b/u;
const SINGLE = /\bIsolationMode\s*\.\s*SingleInstance\b/u;
const PROJECT_CONFIG = /\bAbstractProjectConfig\b/u;

export function projectIsolated(files: ScannedFile[]): boolean {
  return files.some(
    ({ scanned }) => PROJECT_CONFIG.test(scanned.code) && ISOLATING.test(scanned.code),
  );
}

function isPerClass(scanned: TestScanned, klass: ClassInfo): boolean {
  return (
    klass.annotations.some(
      ({ name, args }) => name === 'TestInstance' && args.includes('PER_CLASS'),
    ) || imports(scanned, 'org.testng.annotations.Test')
  );
}

function isSpec(klass: ClassInfo): boolean {
  return klass.supers.some(({ name }) => isSpecType(name) || name === 'AnnotationSpec');
}

function specShares(scanned: TestScanned, klass: ClassInfo, project: ProjectFlags): boolean {
  const text = scanned.code.slice(klass.start, klass.end);
  if (ISOLATING.test(text)) {
    return false;
  }
  return SINGLE.test(text) || !project.kotestIsolated;
}

function directlyIn(scanned: TestScanned, range: Span, offset: number): boolean {
  return (
    range.start <= offset &&
    offset < range.end &&
    enclosingHosts(scanned, range.start, offset).length === 0
  );
}

function holderOf(
  scanned: TestScanned,
  offset: number,
  project: ProjectFlags,
): HolderScope | undefined {
  const classes = classesOf(scanned);
  const owner = enclosingClasses(classes, offset).at(-1);
  if (owner === undefined) {
    return enclosingHosts(scanned, 0, offset).length === 0 ? { scope: 'file' } : undefined;
  }
  const inBody = directlyIn(scanned, { start: owner.bodyOpen + 1, end: owner.bodyClose }, offset);
  if (inBody && owner.kind === 'object' && owner.modifiers.has('companion')) {
    return { scope: CLASS_SCOPE, klass: enclosingClasses(classes, owner.offset).at(-1) };
  }
  if (inBody && owner.kind === CLASS_SCOPE && (isPerClass(scanned, owner) || isSpec(owner))) {
    return isPerClass(scanned, owner) || specShares(scanned, owner, project)
      ? { scope: CLASS_SCOPE, klass: owner }
      : undefined;
  }
  return undefined;
}

function specHolder(
  scanned: TestScanned,
  offset: number,
  project: ProjectFlags,
): HolderScope | undefined {
  const spec = classesOf(scanned).find(
    (klass) =>
      isSpec(klass) &&
      specBodies(scanned, klass).some((range) => directlyIn(scanned, range, offset)),
  );
  return spec !== undefined && specShares(scanned, spec, project)
    ? { scope: CLASS_SCOPE, klass: spec }
    : undefined;
}

function standalone(scanned: TestScanned, offset: number): boolean {
  const header = headerBefore(scanned, offset);
  const lead = scanned.code.slice(lineStartOf(scanned.code, header.start), header.start);
  return lead.trim() === '' && header.annotations.every(({ name }) => KEPT_ANNOTATIONS.has(name));
}

function mutability(scanned: TestScanned, match: RegExpExecArray): Mutability | undefined {
  const [, keyword, , type, assigned] = match;
  const after = match.index + match[0].length;
  const initializer =
    assigned === '=' ? scanned.code.slice(after, expressionEnd(scanned, after)) : '';
  const collection =
    MUTABLE_TYPE.test((type ?? '').trim()) || (assigned === '=' && MUTABLE_INIT.test(initializer));
  if (keyword === 'var') {
    return { reassignable: assigned !== 'by', collection };
  }
  return collection ? { reassignable: false, collection } : undefined;
}

export function sharedHolders(scanned: TestScanned, project: ProjectFlags): SharedHolder[] {
  return remembered(scanned, 'shared-holders', () =>
    [...scanned.code.matchAll(PROPERTY)].flatMap((match) => {
      const kind = mutability(scanned, match);
      if (kind === undefined || !standalone(scanned, match.index)) {
        return [];
      }
      const holder =
        holderOf(scanned, match.index, project) ?? specHolder(scanned, match.index, project);
      return holder === undefined
        ? []
        : [{ name: groupOf(match, 2), offset: match.index, ...kind, ...holder }];
    }),
  );
}
