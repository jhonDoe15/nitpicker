import { compactType } from '../../kotlin-facts.mjs';
import { classesOf } from '../discovery/declarations.mjs';
import { importsOf, packageOf } from '../discovery/imports.mjs';

const GLOBAL_SETTERS = new Map([
  [
    'System',
    ['java.lang', ['setProperty', 'clearProperty', 'setProperties', 'setOut', 'setErr', 'setIn']],
  ],
  ['Thread', ['java.lang', ['setDefaultUncaughtExceptionHandler']]],
  ['Locale', ['java.util', ['setDefault']]],
  ['TimeZone', ['java.util', ['setDefault']]],
  ['Security', ['java.security', ['addProvider', 'insertProviderAt']]],
  ['CookieHandler', ['java.net', ['setDefault']]],
  ['Authenticator', ['java.net', ['setDefault']]],
  ['ProxySelector', ['java.net', ['setDefault']]],
  ['ResponseCache', ['java.net', ['setDefault']]],
  ['SSLContext', ['javax.net.ssl', ['setDefault']]],
  [
    'HttpsURLConnection',
    ['javax.net.ssl', ['setDefaultSSLSocketFactory', 'setDefaultHostnameVerifier']],
  ],
  ['Dispatchers', ['kotlinx.coroutines', ['setMain']]],
]);
const IMPLICIT_PACKAGES = new Set(['java.lang']);
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
const SPECIAL_FAMILIES = new Map([
  ['System.setProperty', 'property'],
  ['System.clearProperty', 'property'],
  ['System.setProperties', 'property'],
  ['Security.addProvider', 'provider'],
  ['Security.insertProviderAt', 'provider'],
  ['Security.removeProvider', 'provider'],
]);

function lowerFirst(text) {
  return text.slice(0, 1).toLowerCase() + text.slice(1);
}

export function memberFamily(type, member) {
  const special = SPECIAL_FAMILIES.get(`${type}.${member}`);
  if (special !== undefined) {
    return special;
  }
  if (SETTER.test(member)) {
    return lowerFirst(member.slice('set'.length));
  }
  return RESETTER.test(member) ? lowerFirst(member.replace(RESETTER, '')) : member;
}

function accessAt(match, kind) {
  const types = compactType(match[2])
    .split('.')
    .filter((name, index) => index === 0 || name !== 'Companion');
  return {
    offset: match.index,
    kind,
    qualifier: compactType(match[1]).replace(/\.$/u, ''),
    outer: types[0],
    type: types.at(-1),
    member: match[3],
  };
}

function shiftedBy(from) {
  return function shifted(access) {
    return { ...access, offset: access.offset + from };
  };
}

export function memberAccesses(code, from = 0, to = code.length) {
  const text = code.slice(from, to);
  const shifted = shiftedBy(from);
  return [
    ...[...text.matchAll(CALL)].map((match) => shifted(accessAt(match, 'call'))),
    ...[...text.matchAll(WRITE)].map((match) => shifted(accessAt(match, 'write'))),
  ];
}

export function familyOf(access) {
  return `${access.type}.${memberFamily(access.type, access.member)}`;
}

function projectRoot(scanned) {
  const parts = packageOf(scanned).split('.').filter(Boolean);
  const hosted = HOSTED_ROOTS.has(parts[1]) ? HOSTED_DEPTH : 0;
  const depth = hosted || (COUNTRY_ROOTS.has(parts[0]) ? COUNTRY_DEPTH : 1);
  return parts.slice(0, depth).join('.');
}

function ownedBy(root, packageName) {
  return root !== '' && (packageName === root || packageName.startsWith(`${root}.`));
}

function packageOfImport(qualified) {
  return qualified.split('.').slice(0, -1).join('.');
}

function importedPackage(scanned, name) {
  const imports = importsOf(scanned);
  const alias = imports.aliases.get(name);
  const qualified = imports.explicit.get(name) ?? alias?.qualified;
  return qualified === undefined ? undefined : packageOfImport(qualified);
}

function isGlobalSetter(scanned, access) {
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

function isProjectState(scanned, access, declared) {
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

export function isJdkGlobal(access) {
  return GLOBAL_SETTERS.has(access.type) && access.type !== 'Dispatchers';
}

export function stateChanges(scanned) {
  const declared = new Set(classesOf(scanned).map(({ name }) => name));
  return memberAccesses(scanned.code).filter(
    (access) => isGlobalSetter(scanned, access) || isProjectState(scanned, access, declared),
  );
}
