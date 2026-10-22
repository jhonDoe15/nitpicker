const SAME_START_SUPERSEDING = new Map([
  ['no-restricted-properties', 'nitpicker/react-no-random-key'],
]);

const ENCLOSING_SUPERSEDING = [
  {
    ruleId: 'nitpicker/no-accumulating-spread',
    messageIds: new Set(['loopArray', 'loopObject']),
    supersededBy: 'functional/no-let',
  },
];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function isSuperseded(message, records, starts) {
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
  const records = messages.filter(isRecord);
  const starts = new Set(records.map((message) => startOf(message.ruleId, message)));
  return messages.filter(
    (message) => !isRecord(message) || !isSuperseded(message, records, starts),
  );
}
