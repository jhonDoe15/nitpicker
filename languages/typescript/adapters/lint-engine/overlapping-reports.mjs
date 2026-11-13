const SAME_START_SUPERSEDING = new Map([
  ['no-restricted-properties', 'nitpicker/react-no-random-key'],
  ['nitpicker/no-costly-collection-form', 'nitpicker/no-in-memory-query'],
]);

const ENCLOSING_SUPERSEDING = [
  {
    ruleId: 'nitpicker/no-accumulating-spread',
    messageIds: new Set(['loopArray', 'loopObject', 'domainLoopArray', 'domainLoopObject']),
    supersededBy: 'functional/no-let',
  },
];

const READONLY_DOMAIN_PREFIXES = ['domain/ types are readonly', 'domain/ data types are readonly'];
const THROW_PREFIX = 'Throw an Error subclass that preserves cause';

const MESSAGE_SUPERSEDING = [
  {
    ruleId: 'no-restricted-syntax',
    messagePrefixes: READONLY_DOMAIN_PREFIXES,
    supersededBy: { ruleId: 'functional/prefer-immutable-types' },
    within: 'enclosing',
  },
  {
    ruleId: '@typescript-eslint/only-throw-error',
    supersededBy: { ruleId: 'no-restricted-syntax', messagePrefixes: [THROW_PREFIX] },
    within: 'start',
  },
];

function isMessage(value) {
  return typeof value === 'object' && value !== null && 'line' in value;
}

function startOf(ruleId, message) {
  return `${String(ruleId)}@${String(message.line)}:${String(message.column)}`;
}

function isAtOrBefore(line, column, other) {
  return line < other.line || (line === other.line && column <= other.column);
}

function encloses(outer, inner) {
  return (
    outer.endLine !== undefined &&
    isAtOrBefore(outer.line, outer.column, inner) &&
    isAtOrBefore(inner.line, inner.column, { line: outer.endLine, column: outer.endColumn })
  );
}

function hasPrefix(message, prefixes) {
  return (
    prefixes === undefined ||
    (typeof message.message === 'string' &&
      prefixes.some((prefix) => message.message.startsWith(prefix)))
  );
}

function isCoveredBy(message, entry, records) {
  const { ruleId, messagePrefixes, supersededBy, within } = entry;
  if (message.ruleId !== ruleId || !hasPrefix(message, messagePrefixes)) {
    return false;
  }
  return records.some(
    (other) =>
      other !== message &&
      other.ruleId === supersededBy.ruleId &&
      hasPrefix(other, supersededBy.messagePrefixes) &&
      (within === 'start'
        ? other.line === message.line && other.column === message.column
        : encloses(other, message)),
  );
}

function isSuperseded(message, records, starts) {
  if (MESSAGE_SUPERSEDING.some((entry) => isCoveredBy(message, entry, records))) {
    return true;
  }
  const sameStart = SAME_START_SUPERSEDING.get(message.ruleId);
  if (sameStart !== undefined && starts.has(startOf(sameStart, message))) {
    return true;
  }
  const enclosing = ENCLOSING_SUPERSEDING.find(
    ({ ruleId, messageIds }) => ruleId === message.ruleId && messageIds.has(message.messageId),
  );
  return (
    enclosing !== undefined &&
    records.some((other) => other.ruleId === enclosing.supersededBy && encloses(other, message))
  );
}

export function withoutSupersededMessages(messages) {
  const records = messages.filter(isMessage);
  const starts = new Set(records.map((message) => startOf(message.ruleId, message)));
  return messages.filter(
    (message) => !isMessage(message) || !isSuperseded(message, records, starts),
  );
}
