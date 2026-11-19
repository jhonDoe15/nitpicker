import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { Declaration, DeclarationInput } from './unused-option-types.mts';
import type { ReachSite, SiteCall } from './unused-option-sites.mts';

const OBJECT_KINDS = new Set(['object', 'companion']);
const NULL_SAFE = /\?$/u;
const THIS = /^this(?:@\w+)?$/u;
const TYPE_PATH = /^(?:[a-z_]\w*\.)*[A-Z]\w*(?:\.[A-Z]\w*)*$/u;
const NONE = new Set<string>();

export function typeAliasNames(files: KotlinFile[]): Set<string> {
  return new Set(files.flatMap(({ typeAliases = [] }) => typeAliases.map(({ name }) => name)));
}

export function declarationOf(
  file: KotlinFile,
  { owner, name, kind, extension }: DeclarationInput,
): Declaration {
  return {
    packageName: file.package,
    top: owner === '' ? name : (owner.split('.')[0] ?? owner),
    owner,
    kind,
    extension,
  };
}

export function functionKind(file: KotlinFile, owner: string): string {
  if (owner === '') {
    return 'top';
  }
  const kind = file.classes.find(({ qualified }) => qualified === owner)?.kind;
  return kind !== undefined && OBJECT_KINDS.has(kind) ? kind : 'member';
}

function visibleFrom(file: KotlinFile, { packageName, top }: Declaration): boolean {
  if (file.package === packageName) {
    return true;
  }
  const declared = `${packageName}.${top}`;
  return (
    packageName !== '' &&
    file.imports.some(
      ({ path, all }) =>
        path === declared || path.startsWith(`${declared}.`) || (all && path === packageName),
    )
  );
}

function ownerQualifiers({ owner, packageName, kind }: Declaration): {
  short: Set<string>;
  full: Set<string>;
} {
  const paths = kind === 'companion' ? [owner, owner.slice(0, owner.lastIndexOf('.'))] : [owner];
  const short = paths.flatMap((path) =>
    path.split('.').map((_, index, parts) => parts.slice(index).join('.')),
  );
  const full = packageName === '' ? [] : paths.map((path) => `${packageName}.${path}`);
  return { short: new Set(short), full: new Set(full) };
}

function resolved(file: KotlinFile, qualifier: string): string {
  const [head, ...rest] = qualifier.split('.');
  const imported = file.imports.find(({ alias }) => alias === head);
  return imported === undefined ? qualifier : [imported.path, ...rest].join('.');
}

function objectReach(
  { file, typeAliases = NONE }: ReachSite,
  text: string,
  declaration: Declaration,
): boolean {
  const { short, full } = ownerQualifiers(declaration);
  if (THIS.test(text) || full.has(text) || typeAliases.has(text.split('.')[0] ?? '')) {
    return true;
  }
  return short.has(text) ? visibleFrom(file, declaration) : !TYPE_PATH.test(text);
}

function qualifiedReach(
  site: ReachSite & { qualifier: string },
  declaration: Declaration,
): boolean {
  const text = resolved(site.file, site.qualifier.replace(NULL_SAFE, ''));
  return declaration.kind === 'top'
    ? text === declaration.packageName
    : objectReach(site, text, declaration);
}

export function reaches(
  { file, qualifier, typeAliases = NONE }: ReachSite,
  declaration: Declaration,
): boolean {
  const { kind, extension } = declaration;
  if (kind === 'member' || (OBJECT_KINDS.has(kind) && (qualifier === undefined || extension))) {
    return true;
  }
  if (qualifier === undefined || extension) {
    return visibleFrom(file, declaration);
  }
  return kind === 'constructor' || qualifiedReach({ file, qualifier, typeAliases }, declaration);
}

export function callReaches(call: SiteCall, declaration: Declaration): boolean {
  const { origin, qualifier, typeAliases } = call;
  return call.aliased || reaches({ file: origin, qualifier, typeAliases }, declaration);
}
