import { CLASS_LIMIT_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
import { EXCEPTION_HINT, renderMessage } from '../../../../shared/policy.mjs';
import { exceptionText } from '../../../../shared/rules/exceptions.mjs';
import { nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';

const TOOL = 'structure';
const LIMITS = [
  {
    metric: 'methods',
    rule: 'class-methods-limit',
    threshold: 'classMethods',
    message: '{name} has {value} methods (limit {limit}). Split it into classes by responsibility.',
    grew: '{name} grew from {base} to {value} methods (limit {limit}). Put the new function in a new class.',
    held: '{name}: {value} methods (limit {limit}), allowed because base was {base}; any increase fails.',
  },
  {
    metric: 'fields',
    rule: 'class-fields-limit',
    threshold: 'classFields',
    message:
      '{name} has {value} fields (limit {limit}). Group related properties into a data class of their own.',
    grew: '{name} grew from {base} to {value} fields (limit {limit}). Put the new property in a new class, or group it with related ones in a data class.',
    held: '{name}: {value} fields (limit {limit}), allowed because base was {base}; any increase fails.',
  },
  {
    metric: 'inheritanceDepth',
    rule: 'inheritance-depth-limit',
    threshold: 'inheritanceDepth',
    message:
      '{name} extends {value} classes deep (limit {limit}). Hold the shared part as a property and delegate to it instead of extending.',
    grew: '{name} now extends {value} classes deep, up from {base} (limit {limit}). Hold the shared part as a property and delegate to it instead of extending.',
    held: '{name}: extends {value} classes deep (limit {limit}), allowed because base was {base}; any increase fails.',
  },
];

function fullName(packageName, name) {
  return packageName === '' ? name : `${packageName}.${name}`;
}

function resolver(files, types) {
  const byName = new Map(
    types.map((type) => [fullName(files.get(type.file)?.package ?? '', type.name), type]),
  );
  return (type) => {
    const file = files.get(type.file) ?? { package: '', imports: [] };
    const written = type.extends;
    const [first, ...rest] = written.split('.');
    const suffix = rest.length === 0 ? '' : `.${rest.join('.')}`;
    const owners = type.name
      .split('.')
      .map((_, index, parts) => parts.slice(0, parts.length - index).join('.'));
    const candidates = [
      ...owners.map((owner) => fullName(file.package, `${owner}.${written}`)),
      ...file.imports
        .filter((name) => name.endsWith(`.${first}`))
        .map((name) => `${name}${suffix}`),
      fullName(file.package, written),
      ...file.imports
        .filter((name) => name.endsWith('.*'))
        .map((name) => `${name.slice(0, -1)}${written}`),
      written,
    ];
    return candidates.map((name) => byName.get(name)).find((found) => found !== undefined);
  };
}

function depthOf(type, parentOf) {
  const chain = [type];
  for (const current of chain) {
    const parent = current.extends === undefined ? undefined : parentOf(current);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain.filter((link) => link.extends !== undefined).length;
}

function label(type) {
  return `${type.kind[0].toUpperCase()}${type.kind.slice(1)} ${type.name}`;
}

function limitFinding(type, limit, { value, occurrence, max }) {
  const values = {
    name: label(type),
    value,
    limit: max,
    base: '{base}',
    exception: exceptionText(limit.rule, type.file),
  };
  function withHint(template) {
    return renderMessage(`${template} ${EXCEPTION_HINT}`, values);
  }
  return {
    tool: TOOL,
    rule: limit.rule,
    path: type.file,
    identity: `${limit.metric}:${type.name}:occurrence:${String(occurrence)}:${String(value)}`,
    message: withHint(limit.message),
    classification: 'enforceable',
    location: { line: type.start },
    ratchet: {
      key: limit.metric,
      value,
      worseMessage: withHint(limit.grew),
      heldMessage: renderMessage(limit.held, values),
    },
  };
}

export function readKotlinClassLimitFindings(metrics, thresholds = {}) {
  const limits = { ...CLASS_LIMIT_DEFAULTS, ...thresholds };
  const types = metrics.types ?? [];
  const files = new Map(
    metrics.files.map((file) => [
      file.file,
      { package: file.package, imports: file.imports ?? [] },
    ]),
  );
  const parentOf = resolver(files, types);
  const occurrences = new Map();
  return types.flatMap((type) => {
    const occurrence = nextOccurrence(occurrences, `${type.file}\0${type.name}`);
    const measured = { ...type, inheritanceDepth: depthOf(type, parentOf) };
    return LIMITS.filter(({ metric, threshold }) => measured[metric] > limits[threshold]).map(
      (limit) =>
        limitFinding(type, limit, {
          value: measured[limit.metric],
          occurrence,
          max: limits[limit.threshold],
        }),
    );
  });
}
