import { classesOf, enclosingClasses } from '../discovery/declarations.mjs';
import { enclosingHosts } from '../discovery/hosts.mjs';
import { isSpecType } from '../discovery/kotest/kotest-specs.mjs';
import { declarationsOf } from './start-kinds.mjs';

export function ownerOf(scanned, offset) {
  return enclosingClasses(classesOf(scanned), offset).at(-1);
}

export function memberClass(scanned, offset) {
  const klass = ownerOf(scanned, offset);
  if (klass === undefined) {
    return undefined;
  }
  return enclosingHosts(scanned, klass.bodyOpen, offset).length === 1 ? klass : undefined;
}

export function perTestInstances(klass) {
  return (
    klass?.kind === 'class' &&
    !klass.supers.some(({ name }) => isSpecType(name)) &&
    !klass.annotations.some(
      ({ name, args }) => name === 'TestInstance' && args.includes('PER_CLASS'),
    )
  );
}

function within(range, offset) {
  return range.start <= offset && offset < range.end;
}

function ownerChain(scanned, offset) {
  return enclosingClasses(classesOf(scanned), offset).toReversed();
}

function companionsOf(scanned, owner) {
  return classesOf(scanned).filter(
    (klass) => klass.kind === 'object' && memberClass(scanned, klass.offset) === owner,
  );
}

function memberOf(scanned, declarations, owner) {
  const holders = new Set([owner, ...companionsOf(scanned, owner)]);
  return declarations.find((declaration) => holders.has(memberClass(scanned, declaration.offset)));
}

function outsideClasses(scanned, declarations, offset) {
  return declarations
    .filter((declaration) => declaration.offset < offset)
    .findLast((declaration) => memberClass(scanned, declaration.offset) === undefined);
}

export function resolveReceiver(scanned, site, range) {
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
