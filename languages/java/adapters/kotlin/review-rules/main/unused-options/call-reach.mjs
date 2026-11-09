const OBJECT_KINDS = new Set(['object', 'companion']);
const NULL_SAFE = /\?$/u;
const THIS = /^this(?:@\w+)?$/u;
const TYPE_PATH = /^(?:[a-z_]\w*\.)*[A-Z]\w*(?:\.[A-Z]\w*)*$/u;
const NONE = new Set();

export function typeAliasNames(files) {
  return new Set(files.flatMap(({ typeAliases = [] }) => typeAliases.map(({ name }) => name)));
}

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
  return OBJECT_KINDS.has(kind) ? kind : 'member';
}

function visibleFrom(file, { packageName, top }) {
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

function ownerQualifiers({ owner, packageName, kind }) {
  const paths = kind === 'companion' ? [owner, owner.slice(0, owner.lastIndexOf('.'))] : [owner];
  const short = paths.flatMap((path) =>
    path.split('.').map((_, index, parts) => parts.slice(index).join('.')),
  );
  const full = packageName === '' ? [] : paths.map((path) => `${packageName}.${path}`);
  return { short: new Set(short), full: new Set(full) };
}

function resolved(file, qualifier) {
  const [head, ...rest] = qualifier.split('.');
  const imported = (file.imports ?? []).find(({ alias }) => alias === head);
  return imported === undefined ? qualifier : [imported.path, ...rest].join('.');
}

function objectReach({ file, typeAliases }, text, declaration) {
  const { short, full } = ownerQualifiers(declaration);
  if (THIS.test(text) || full.has(text) || typeAliases.has(text.split('.')[0])) {
    return true;
  }
  return short.has(text) ? visibleFrom(file, declaration) : !TYPE_PATH.test(text);
}

function qualifiedReach(site, declaration) {
  const text = resolved(site.file, site.qualifier.replace(NULL_SAFE, ''));
  return declaration.kind === 'top'
    ? text === declaration.packageName
    : objectReach(site, text, declaration);
}

export function reaches({ file, qualifier, typeAliases = NONE }, declaration) {
  const { kind, extension } = declaration;
  if (kind === 'member' || (OBJECT_KINDS.has(kind) && (qualifier === undefined || extension))) {
    return true;
  }
  if (qualifier === undefined || extension) {
    return visibleFrom(file, declaration);
  }
  return kind === 'constructor' || qualifiedReach({ file, qualifier, typeAliases }, declaration);
}

export function callReaches(call, declaration) {
  const { origin, qualifier, typeAliases } = call;
  return (
    origin === undefined ||
    call.aliased ||
    reaches({ file: origin, qualifier, typeAliases }, declaration)
  );
}
