export const PERMISSIVE_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-style',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'Unlicense',
]);

export const WEAK_COPYLEFT_LICENSES = new Set([
  'EPL-1.0',
  'EPL-2.0',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'MPL-1.1',
  'MPL-2.0',
]);

const FORBIDDEN_TEXT_MARKERS = [
  ['GPL or AGPL', /^\s*GNU (?:AFFERO )?GENERAL PUBLIC LICENSE\s*$/im],
  ['SSPL', /SERVER SIDE PUBLIC LICENSE/i],
  ['SSALv1', /SONAR SOURCE-AVAILABLE LICENSE|SSALv1/i],
  ['BSL', /BUSINESS SOURCE LICENSE/i],
  ['Elastic License', /ELASTIC LICENSE/i],
  ['Commons Clause', /COMMONS CLAUSE/i],
  ['PolyForm', /POLYFORM/i],
  ['Functional Source License', /FUNCTIONAL SOURCE LICENSE/i],
  ['Confluent Community License', /CONFLUENT COMMUNITY LICENSE/i],
];

export const PERMISSIVE = 'permissive';
export const WEAK_COPYLEFT = 'weak-copyleft';
export const REJECTED = 'rejected';

const RANK = { [REJECTED]: 0, [WEAK_COPYLEFT]: 1, [PERMISSIVE]: 2 };

function baseIdentifier(identifier) {
  return identifier
    .trim()
    .replace(/\s+WITH\s+.*$/i, '')
    .replace(/(?:-only|-or-later|\+)$/i, '');
}

const VERDICT_PREFIX = '@';
const INNERMOST_GROUP = /\(([^()]*)\)/;

function classifyIdentifier(identifier) {
  if (identifier.startsWith(VERDICT_PREFIX)) {
    return identifier.slice(VERDICT_PREFIX.length);
  }
  const base = baseIdentifier(identifier);
  if (PERMISSIVE_LICENSES.has(base)) {
    return PERMISSIVE;
  }
  return WEAK_COPYLEFT_LICENSES.has(base) ? WEAK_COPYLEFT : REJECTED;
}

function pick(verdicts, better) {
  return verdicts.reduce((left, right) => (better(RANK[right], RANK[left]) ? right : left));
}

function classifyFlat(expression) {
  const alternatives = expression.split(/\s+OR\s+/i).map((alternative) =>
    pick(
      alternative.split(/\s+AND\s+/i).map((identifier) => classifyIdentifier(identifier.trim())),
      (right, left) => right < left,
    ),
  );
  return pick(alternatives, (right, left) => right > left);
}

export function classifyExpression(expression) {
  const group = INNERMOST_GROUP.exec(expression);
  return group === null
    ? classifyFlat(expression.trim())
    : classifyExpression(
        expression.replace(INNERMOST_GROUP, ` ${VERDICT_PREFIX}${classifyFlat(group[1].trim())} `),
      );
}

export function declaredExpression(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === 'string') {
    return license;
  }
  if (typeof license?.type === 'string') {
    return license.type;
  }
  if (Array.isArray(licenses) && licenses.length > 0) {
    return licenses.map((entry) => (typeof entry === 'string' ? entry : entry?.type)).join(' OR ');
  }
  return undefined;
}

export function forbiddenLicenseText(text) {
  return FORBIDDEN_TEXT_MARKERS.find(([, pattern]) => pattern.test(text))?.[0];
}
