import type { TestScanned } from '../typed/discovery-types.mts';
import type { Access } from '../typed/rule-types.mts';
import { compactType } from '../../kotlin-facts.mts';
import { classesOf } from '../discovery/declarations.mts';
import { importsOf, packageOf } from '../discovery/imports.mts';

const SET_DEFAULT = 'setDefault';
const JAVA_NET = 'java.net';
const JAVA_LANG = 'java.lang';
const PROPERTY_FAMILY = 'property';
const PROVIDER_FAMILY = 'provider';
const GLOBAL_SETTERS = new Map<string, [string, string[]]>([
  [
    'System',
    [JAVA_LANG, ['setProperty', 'clearProperty', 'setProperties', 'setOut', 'setErr', 'setIn']],
  ],
  ['Thread', [JAVA_LANG, ['setDefaultUncaughtExceptionHandler']]],
  ['Locale', ['java.util', [SET_DEFAULT]]],
  ['TimeZone', ['java.util', [SET_DEFAULT]]],
  ['Security', ['java.security', ['addProvider', 'insertProviderAt']]],
  ['CookieHandler', [JAVA_NET, [SET_DEFAULT]]],
  ['Authenticator', [JAVA_NET, [SET_DEFAULT]]],
  ['ProxySelector', [JAVA_NET, [SET_DEFAULT]]],
  ['ResponseCache', [JAVA_NET, [SET_DEFAULT]]],
  ['SSLContext', ['javax.net.ssl', [SET_DEFAULT]]],
  [
    'HttpsURLConnection',
    ['javax.net.ssl', ['setDefaultSSLSocketFactory', 'setDefaultHostnameVerifier']],
  ],
  ['Dispatchers', ['kotlinx.coroutines', ['setMain']]],
]);
const IMPLICIT_PACKAGES = new Set([JAVA_LANG]);
const PLATFORM_TYPES = new Set(['System', 'Thread', 'Runtime']);
const COUNTRY_ROOTS = new Set(
  [
    'com org net io dev app co me ai edu gov info de fr uk nl ch be it es se no fi dk pl at cz ru cn jp',
    'kr in br au ca us eu',
  ]
    .join(' ')
    .split(' '),
);
const HOSTED_ROOTS = new Set(['github', 'gitlab', 'bitbucket']);
const HOSTED_DEPTH = 3;
const COUNTRY_DEPTH = 2;
const MEMBER_ACCESS = [
  '(?<![\\w.$`])',
  String.raw`((?:[a-z]\w*\s*\.\s*)*)((?:[A-Z]\w*\s*\.\s*)*[A-Z]\w*)\s*\.\s*(?:Companion\s*\.\s*)?`,
].join('');
const CALL = new RegExp(`${MEMBER_ACCESS}([a-zA-Z_]\\w*)\\s*[({]`, 'gu');
const WRITE = new RegExp(`${MEMBER_ACCESS}([a-z_]\\w*)\\s*(?:=(?!=)|[-+*/%]=|\\+\\+|--)`, 'gu');
const SETTER = /^set[A-Z]/u;
const SET_UP = /^setUp(?:[A-Z]|$)/u;
const RESETTER = /^(?:reset|clear|restore|unset)(?=[A-Z]|$)/u;
const SPECIAL_FAMILIES = new Map<string, string>([
  ['System.setProperty', PROPERTY_FAMILY],
  ['System.clearProperty', PROPERTY_FAMILY],
  ['System.setProperties', PROPERTY_FAMILY],
  ['Security.addProvider', PROVIDER_FAMILY],
  ['Security.insertProviderAt', PROVIDER_FAMILY],
  ['Security.removeProvider', PROVIDER_FAMILY],
]);

function lowerFirst(text: string): string {
  return text.slice(0, 1).toLowerCase() + text.slice(1);
}

export function memberFamily(type: string, member: string): string {
  const special = SPECIAL_FAMILIES.get(`${type}.${member}`);
  if (special !== undefined) {
    return special;
  }
  if (SETTER.test(member)) {
    return lowerFirst(member.slice('set'.length));
  }
  return RESETTER.test(member) ? lowerFirst(member.replace(RESETTER, '')) : member;
}

function accessAt(match: RegExpExecArray, kind: 'call' | 'write'): Access {
  const [, qualifier = '', typeText = '', member = ''] = match;
  const types = compactType(typeText)
    .split('.')
    .filter((name, index) => index === 0 || name !== 'Companion');
  return {
    offset: match.index,
    kind,
    qualifier: compactType(qualifier).replace(/\.$/u, ''),
    outer: types[0] ?? '',
    type: types.at(-1) ?? '',
    member,
  };
}

function shiftedBy(from: number): (access: Access) => Access {
  return function shifted(access) {
    return { ...access, offset: access.offset + from };
  };
}

export function memberAccesses(code: string, from = 0, to = code.length): Access[] {
  const text = code.slice(from, to);
  const shifted = shiftedBy(from);
  return [
    ...[...text.matchAll(CALL)].map((match) => shifted(accessAt(match, 'call'))),
    ...[...text.matchAll(WRITE)].map((match) => shifted(accessAt(match, 'write'))),
  ];
}

export function familyOf(access: Access): string {
  return `${access.type}.${memberFamily(access.type, access.member)}`;
}

function projectRoot(scanned: TestScanned): string {
  const parts = packageOf(scanned).split('.').filter(Boolean);
  const hosted = HOSTED_ROOTS.has(parts[1] ?? '') ? HOSTED_DEPTH : 0;
  const rooted = COUNTRY_ROOTS.has(parts[0] ?? '') ? COUNTRY_DEPTH : 1;
  const depth = hosted > 0 ? hosted : rooted;
  return parts.slice(0, depth).join('.');
}

function ownedBy(root: string, packageName: string): boolean {
  return root !== '' && (packageName === root || packageName.startsWith(`${root}.`));
}

function packageOfImport(qualified: string): string {
  return qualified.split('.').slice(0, -1).join('.');
}

function importedPackage(scanned: TestScanned, name: string): string | undefined {
  const imports = importsOf(scanned);
  const alias = imports.aliases.get(name);
  const qualified = imports.explicit.get(name) ?? alias?.qualified;
  return qualified === undefined ? undefined : packageOfImport(qualified);
}

function isGlobalSetter(scanned: TestScanned, access: Access): boolean {
  const known = GLOBAL_SETTERS.get(access.type);
  if (access.kind !== 'call' || known === undefined || access.outer !== access.type) {
    return false;
  }
  const [home, members] = known;
  if (!members.includes(access.member)) {
    return false;
  }
  if (access.qualifier !== '') {
    return access.qualifier === home;
  }
  const imported = importedPackage(scanned, access.type);
  if (imported !== undefined) {
    return imported === home;
  }
  return IMPLICIT_PACKAGES.has(home) || importsOf(scanned).stars.has(home);
}

function isProjectState(scanned: TestScanned, access: Access, declared: Set<string>): boolean {
  const isChange =
    access.kind === 'write' || (SETTER.test(access.member) && !SET_UP.test(access.member));
  if (!isChange || PLATFORM_TYPES.has(access.outer) || declared.has(access.outer)) {
    return false;
  }
  const root = projectRoot(scanned);
  if (access.qualifier !== '') {
    return ownedBy(root, access.qualifier);
  }
  const imported = importedPackage(scanned, access.outer);
  return imported === undefined || ownedBy(root, imported);
}

export function isJdkGlobal(access: Access): boolean {
  return GLOBAL_SETTERS.has(access.type) && access.type !== 'Dispatchers';
}

export function stateChanges(scanned: TestScanned): Access[] {
  const declared = new Set(classesOf(scanned).map(({ name }) => name));
  return memberAccesses(scanned.code).filter(
    (access) => isGlobalSetter(scanned, access) || isProjectState(scanned, access, declared),
  );
}
