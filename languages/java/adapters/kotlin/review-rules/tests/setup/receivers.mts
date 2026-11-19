import type { HeavyDeclaration, Resolved, StartSite } from '../typed/rule-types.mts';
import type { ClassInfo, Span, TestScanned } from '../typed/discovery-types.mts';
import { classesOf, enclosingClasses } from '../discovery/declarations.mts';
import { enclosingHosts } from '../discovery/hosts.mts';
import { isSpecType } from '../discovery/kotest/kotest-specs.mts';
import { declarationsOf } from './start-kinds.mts';

export function ownerOf(scanned: TestScanned, offset: number): ClassInfo | undefined {
  return enclosingClasses(classesOf(scanned), offset).at(-1);
}

export function memberClass(scanned: TestScanned, offset: number): ClassInfo | undefined {
  const klass = ownerOf(scanned, offset);
  if (klass === undefined) {
    return undefined;
  }
  return enclosingHosts(scanned, klass.bodyOpen, offset).length === 1 ? klass : undefined;
}

export function perTestInstances(klass: ClassInfo | undefined): boolean {
  return (
    klass?.kind === 'class' &&
    !klass.supers.some(({ name }) => isSpecType(name)) &&
    !klass.annotations.some(
      ({ name, args }) => name === 'TestInstance' && args.includes('PER_CLASS'),
    )
  );
}

function within(range: Span, offset: number): boolean {
  return range.start <= offset && offset < range.end;
}

function ownerChain(scanned: TestScanned, offset: number): ClassInfo[] {
  return enclosingClasses(classesOf(scanned), offset).toReversed();
}

function companionsOf(scanned: TestScanned, owner: ClassInfo): ClassInfo[] {
  return classesOf(scanned).filter(
    (klass) => klass.kind === 'object' && memberClass(scanned, klass.offset) === owner,
  );
}

function memberOf(
  scanned: TestScanned,
  declarations: HeavyDeclaration[],
  owner: ClassInfo,
): HeavyDeclaration | undefined {
  const holders = new Set<ClassInfo | undefined>([owner, ...companionsOf(scanned, owner)]);
  return declarations.find((declaration) => holders.has(memberClass(scanned, declaration.offset)));
}

function outsideClasses(
  scanned: TestScanned,
  declarations: HeavyDeclaration[],
  offset: number,
): HeavyDeclaration | undefined {
  return declarations
    .filter((declaration) => declaration.offset < offset)
    .findLast((declaration) => memberClass(scanned, declaration.offset) === undefined);
}

export function resolveReceiver(
  scanned: TestScanned,
  site: StartSite,
  range: Span,
): Resolved | undefined {
  const declarations = declarationsOf(scanned).filter(({ name }) => name === site.receiver);
  const local = declarations
    .filter(({ offset }) => within(range, offset) && offset < site.offset)
    .at(-1);
  if (local !== undefined) {
    return { declaration: local, local: true };
  }
  const member = ownerChain(scanned, site.offset)
    .map((owner) => memberOf(scanned, declarations, owner))
    .find((found) => found !== undefined);
  const declaration = member ?? outsideClasses(scanned, declarations, site.offset);
  return declaration === undefined ? undefined : { declaration, local: false };
}
