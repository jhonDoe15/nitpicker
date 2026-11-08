const OBJECT_KINDS = new Set(['object', 'companion']);
const NULL_SAFE = /\?$/u;
const COMPANION = '.Companion';

export function declarationOf(file, { owner, name, kind, extension = false }) {
  return {
    packageName: file.package ?? '',
    top: owner === '' ? name : owner.split('.')[0],
    owner,
    kind,
    extension,
  };
}

export function functionKind(file, owner) {
  if (owner === '') {
    return 'top';
  }
  const kind = file.classes.find(({ qualified }) => qualified === owner)?.kind;
  return OBJECT_KINDS.has(kind) ? 'object' : 'member';
}

export function visibleFrom(file, { packageName, top }) {
  if ((file.package ?? '') === packageName) {
    return true;
  }
  const declared = `${packageName}.${top}`;
  return (
    packageName !== '' &&
    (file.imports ?? []).some(
      ({ path, all }) =>
        path === declared || path.startsWith(`${declared}.`) || (all && path === packageName),
    )
  );
}

function ownerQualifiers({ owner, packageName }) {
  const paths = owner.endsWith(COMPANION) ? [owner, owner.slice(0, -COMPANION.length)] : [owner];
  const short = paths.flatMap((path) =>
    path.split('.').map((_, index, parts) => parts.slice(index).join('.')),
  );
  const full = packageName === '' ? [] : paths.map((path) => `${packageName}.${path}`);
  return { short: new Set(short), full: new Set(full) };
}

function aliasedName(file, name) {
  const imported = (file.imports ?? []).find(({ alias }) => alias === name);
  return imported === undefined ? name : imported.path.split('.').at(-1);
}

export function qualifiedReach(file, qualifier, declaration) {
  const text = aliasedName(file, qualifier.replace(NULL_SAFE, ''));
  if (declaration.kind === 'top') {
    return text === declaration.packageName;
  }
  const { short, full } = ownerQualifiers(declaration);
  return text === 'this' || full.has(text) || (short.has(text) && visibleFrom(file, declaration));
}

export function callReaches(call, declaration) {
  const { origin, qualifier } = call;
  if (origin === undefined || call.aliased || declaration.kind === 'member') {
    return true;
  }
  if (qualifier === undefined || declaration.extension) {
    return visibleFrom(origin, declaration);
  }
  return declaration.kind === 'constructor' || qualifiedReach(origin, qualifier, declaration);
}
