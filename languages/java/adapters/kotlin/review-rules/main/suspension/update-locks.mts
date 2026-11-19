import type { ClassScope, ItemScope } from '../locking/locking-types.mts';
import type { TopLevelProperty, UpdateFact } from './suspension-types.mts';
import type { SuspensionSite, SuspensionView } from './suspension-sites.mts';
import { appendAll as untypedAppendAll } from '../../../../../../../shared/lists/items.mjs';

const appendAll: <Item>(target: Item[], items: Item[]) => Item[] = untypedAppendAll;

const LAUNCHERS = new Set(['launch', 'async']);
const THIS_PREFIX = /^this\./u;

function isLocalProperty(qualifier: string | undefined, update: UpdateFact): boolean {
  return qualifier !== undefined && (update.properties ?? []).includes(qualifier);
}

function companionsOf(klass: ClassScope, view: SuspensionView): string[] {
  return view.classes
    .filter(
      ({ kind, qualified }) => kind === 'companion' && qualified.startsWith(`${klass.qualified}.`),
    )
    .map(({ qualified }) => qualified);
}

function gateProperty(
  qualifier: string | undefined,
  update: UpdateFact,
  { file, view, klass }: SuspensionSite,
): TopLevelProperty | undefined {
  const name = qualifier?.replace(THIS_PREFIX, '');
  if (name === undefined || isLocalProperty(qualifier, update)) {
    return undefined;
  }
  const owners: string[] = klass === undefined ? [] : [klass.qualified];
  if (klass !== undefined && !THIS_PREFIX.test(qualifier ?? '')) {
    appendAll(owners, companionsOf(klass, view));
  }
  const member = file.properties.find(
    (declared) => owners.includes(declared.owner) && declared.name === name,
  );
  if (member !== undefined || THIS_PREFIX.test(qualifier ?? '')) {
    return member;
  }
  return (file.topLevelProperties ?? []).find((declared) => declared.name === name);
}

function singlePermit(
  qualifier: string | undefined,
  update: UpdateFact,
  site: SuspensionSite,
): boolean {
  const property = gateProperty(qualifier, update, site);
  return property?.initializer === 'Semaphore' && !property.var && property.argument === '1';
}

export function lockHeld(lambdas: ItemScope[], update: UpdateFact, site: SuspensionSite): boolean {
  for (const { host, qualifier } of lambdas) {
    if (host !== undefined && LAUNCHERS.has(host)) {
      return false;
    }
    if (host === 'withLock' && !isLocalProperty(qualifier, update)) {
      return true;
    }
    if (host === 'withPermit' && singlePermit(qualifier, update, site)) {
      return true;
    }
  }
  return false;
}
