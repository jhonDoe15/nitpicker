const PERMISSIVE_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'PSF-2.0',
  'Unlicense',
]);

const WEAK_COPYLEFT_LICENSES = new Set([
  'EPL-1.0',
  'EPL-2.0',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'MPL-1.1',
  'MPL-2.0',
]);

const GPL_MARKER = 'GPL or AGPL';
const POLYFORM_KINDS = [
  'NONCOMMERCIAL',
  'SHIELD',
  'STRICT',
  'PERIMETER',
  'SMALL[\\s-]BUSINESS',
  'FREE[\\s-]TRIAL',
  'INTERNAL[\\s-]USE',
  'COUNTERSIGNATURE',
  'ALTRUISTIC',
  'BUSINESS',
  'TRIAL',
].join('|');

const FORBIDDEN_TEXT_MARKERS = [
  [GPL_MARKER, /GNU\s+(?:AFFERO\s+)?GENERAL\s+PUBLIC\s+LICENSE[\s*_#]*Version\s+[23]/i],
  [GPL_MARKER, /^[\s#*_]*GNU\s+(?:AFFERO\s+)?GENERAL\s+PUBLIC\s+LICENSE[\s*_]*$/im],
  [GPL_MARKER, /under\s+the\s+terms\s+of\s+the\s+GNU\s+(?:AFFERO\s+)?GENERAL\s+PUBLIC\s+LICENSE/i],
  ['SSPL', /SERVER SIDE PUBLIC LICENSE[\s*_#,]*VERSION/i],
  ['SSALv1', /SONAR SOURCE-AVAILABLE LICENSE|SSALv1/i],
  ['BSL', /BUSINESS SOURCE LICENSE[\s*_#,(]*(?:V(?:ERSION)?\s*)?\d/i],
  ['Elastic License', /ELASTIC LICENSE[\s*_#,(]*(?:V(?:ERSION)?\s*)?\d/i],
  ['Commons Clause', /COMMONS CLAUSE"?\s+LICENSE\s+CONDITION/i],
  ['PolyForm', new RegExp(`POLYFORM[\\s-]+(?:${POLYFORM_KINDS})[^\\n]{0,30}LICENSE`, 'i')],
  ['Functional Source License', /FUNCTIONAL SOURCE LICENSE[\s*_#,]*VERSION/i],
  ['Confluent Community License', /CONFLUENT COMMUNITY LICENSE[\s*_#,]*VERSION/i],
  [
    'Creative Commons NonCommercial',
    /ATTRIBUTION[- ]NON-?COMMERCIAL|CC[- ]BY[- ]NC|CREATIVE COMMONS[^\n]{0,40}NON-?COMMERCIAL/i,
  ],
  ['Sustainable Use License', /SUSTAINABLE USE LICENSE[\s*_#:]*VERSION/i],
  [
    'Redis Source Available License',
    /REDIS SOURCE AVAILABLE LICENSE[\s*_#,(]*(?:V(?:ERSION)?\s*)?\d|RSALv2/i,
  ],
  ['Prosperity Public License', /PROSPERITY PUBLIC LICENSE[\s*_#,]*\d/i],
];

export const PERMISSIVE = 'permissive';
export const WEAK_COPYLEFT = 'weak-copyleft';
export const REJECTED = 'rejected';

const RANK = { [REJECTED]: 0, [WEAK_COPYLEFT]: 1, [PERMISSIVE]: 2 };

function baseIdentifier(identifier) {
  return identifier
    .trim()
    .split(/\s+WITH\s+/i)[0]
    .replace(/(?:-only|-or-later|\+)$/i, '');
}

const VERDICT_PREFIX = '\u0001';
const INNERMOST_GROUP = /\(([^()]*)\)/;

function classifyIdentifier(identifier, extraPermissive) {
  if (identifier.startsWith(VERDICT_PREFIX)) {
    return identifier.slice(VERDICT_PREFIX.length);
  }
  const base = baseIdentifier(identifier);
  if (PERMISSIVE_LICENSES.has(base) || extraPermissive.has(base)) {
    return PERMISSIVE;
  }
  return WEAK_COPYLEFT_LICENSES.has(base) ? WEAK_COPYLEFT : REJECTED;
}

function pick(verdicts, better) {
  return verdicts.reduce((left, right) => (better(RANK[right], RANK[left]) ? right : left));
}

function classifyFlat(expression, extraPermissive) {
  const alternatives = expression.split(/\s+OR\s+/i).map((alternative) =>
    pick(
      alternative
        .split(/\s+AND\s+/i)
        .map((identifier) => classifyIdentifier(identifier.trim(), extraPermissive)),
      (right, left) => right < left,
    ),
  );
  return pick(alternatives, (right, left) => right > left);
}

function collapseInnermostGroup(extraPermissive) {
  return (expression) => {
    const group = INNERMOST_GROUP.exec(expression);
    return group === null
      ? expression
      : expression.replace(
          INNERMOST_GROUP,
          ` ${VERDICT_PREFIX}${classifyFlat(group[1].trim(), extraPermissive)} `,
        );
  };
}

export function classifyExpression(expression, { extraPermissive = new Set() } = {}) {
  if (expression.includes(VERDICT_PREFIX)) {
    return REJECTED;
  }
  const groups = expression.split('(').slice(1);
  const collapse = collapseInnermostGroup(extraPermissive);
  return classifyFlat(
    groups.reduce((current) => collapse(current), expression).trim(),
    extraPermissive,
  );
}

export function offersChoice(expression) {
  return /\s+OR\s+/i.test(expression) && classifyExpression(expression) !== REJECTED;
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

export function forbiddenLicenseText(text, { allowGpl = false } = {}) {
  return FORBIDDEN_TEXT_MARKERS.find(
    ([name, pattern]) => !(allowGpl && name === GPL_MARKER) && pattern.test(text),
  )?.[0];
}
