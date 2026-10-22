import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { listSites, siteText } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.dataClump;
const CLUMP_SIZE = 3;
const MIN_SITES = 3;
const MIN_MODULES = 2;
const MAX_PARAMS = 8;
const NUMERIC_TYPES = new Set([
  'number',
  'bigint',
  'int',
  'long',
  'short',
  'byte',
  'float',
  'double',
  'Int',
  'Long',
  'Short',
  'Byte',
  'Float',
  'Double',
  'Integer',
  'Number',
]);
const COORDINATE_NAMES = new Set(
  ['x', 'y', 'z', 'w', 'r', 'g', 'b', 'a', 'h', 's', 'l', 'v', 'i', 'j', 'k', 'n', 'm'].concat([
    'lat',
    'lng',
    'lon',
    'alt',
    'width',
    'height',
    'depth',
    'dx',
    'dy',
    'dz',
  ]),
);

function parameterKeys(callable) {
  return (callable.params ?? [])
    .slice(0, MAX_PARAMS)
    .filter(({ type, variadic, pattern }) => type !== undefined && !variadic && !pattern)
    .map(({ name, type }) => `${name}: ${type}`)
    .sort();
}

function triples(keys) {
  const found = [];
  for (const [first, a] of keys.entries()) {
    for (const [second, b] of keys.slice(first + 1).entries()) {
      for (const c of keys.slice(first + second + 2)) {
        found.push([a, b, c]);
      }
    }
  }
  return found;
}

function isNumericKernel(keys) {
  return keys.every((key) => {
    const [name, type] = key.split(': ');
    return NUMERIC_TYPES.has(type) && COORDINATE_NAMES.has(name.toLowerCase());
  });
}

function candidateSets(sites) {
  const supporters = new Map();
  for (const site of sites) {
    for (const triple of triples(site.keys)) {
      const key = triple.join('\0');
      supporters.set(key, [...(supporters.get(key) ?? []), site]);
    }
  }
  const sets = new Map();
  for (const group of supporters.values()) {
    const shared = group[0].keys.filter((key) => group.every((site) => site.keys.includes(key)));
    sets.set(shared.join('\0'), shared);
  }
  return [...sets.values()].toSorted((left, right) => right.length - left.length);
}

function supportOf(keys, sites) {
  return sites.filter((site) => keys.every((key) => site.keys.includes(key)));
}

function existingOwner(keys, index) {
  const names = keys.map((key) => key.split(': ')[0]);
  return index.types.find(
    ({ kind, fields = [] }) =>
      (kind === 'data' || kind === 'class') &&
      names.every((name) => fields.some((field) => field.name === name)),
  );
}

function clumpFinding({ keys, support }, { index, finding }) {
  const ordered = support.toSorted(
    (left, right) =>
      left.callable.file.localeCompare(right.callable.file) ||
      left.callable.line - right.callable.line,
  );
  const [first] = ordered;
  const owner = existingOwner(keys, index);
  const ownerText =
    owner === undefined
      ? 'Give them one value type that owns their rules'
      : `Use ${owner.name}, which already has these fields,`;
  return finding({
    rule: RULE,
    path: first.callable.file,
    identity: keys.join(', '),
    line: first.callable.line,
    message: `The parameters ${quoted(keys)} travel together through ${String(support.length)} functions: ${listSites(ordered.map(({ callable }) => siteText(callable, index)))}. ${ownerText} and pass that instead.`,
  });
}

export function dataClumpFindings(index, finding) {
  const sites = index.callables
    .filter(({ exported, entry }) => exported && entry !== true)
    .filter((callable) => !index.isPublished(callable))
    .map((callable) => ({ callable, keys: parameterKeys(callable) }))
    .filter(({ keys }) => keys.length >= CLUMP_SIZE);
  const reported = [];
  for (const keys of candidateSets(sites)) {
    const support = supportOf(keys, sites);
    const modules = new Set(support.map(({ callable }) => callable.file)).size;
    const covered = reported.some(({ keys: wider }) => keys.every((key) => wider.includes(key)));
    if (
      support.length >= MIN_SITES &&
      modules >= MIN_MODULES &&
      !covered &&
      !isNumericKernel(keys)
    ) {
      reported.push({ keys, support });
    }
  }
  return reported.flatMap((clump) => clumpFinding(clump, { index, finding }));
}
