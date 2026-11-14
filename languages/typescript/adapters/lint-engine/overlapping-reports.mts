type ReportedMessage = {
  readonly ruleId?: unknown;
  readonly messageId?: unknown;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
};

type Position = { readonly line: number; readonly column: number };

const SAME_START_SUPERSEDING = new Map<unknown, string>([
  ['no-restricted-properties', 'nitpicker/react-no-random-key'],
  ['nitpicker/no-costly-collection-form', 'nitpicker/no-in-memory-query'],
  ['nitpicker/no-wasted-collection-step', '@typescript-eslint/prefer-find'],
]);

const ENCLOSING_SUPERSEDING = [
  {
    ruleId: 'nitpicker/no-accumulating-spread',
    messageIds: new Set<unknown>([
      'loopArray',
      'loopObject',
      'domainLoopArray',
      'domainLoopObject',
    ]),
    supersededBy: 'functional/no-let',
  },
];

function isMessage(value: unknown): value is ReportedMessage {
  return typeof value === 'object' && value !== null && 'line' in value;
}

function startOf(ruleId: unknown, message: ReportedMessage): string {
  return `${String(ruleId)}@${String(message.line)}:${String(message.column)}`;
}

function isAtOrBefore(line: number, column: number, other: Position): boolean {
  return line < other.line || (line === other.line && column <= other.column);
}

function encloses(outer: ReportedMessage, inner: ReportedMessage): boolean {
  return (
    outer.endLine !== undefined &&
    outer.endColumn !== undefined &&
    isAtOrBefore(outer.line, outer.column, inner) &&
    isAtOrBefore(inner.line, inner.column, { line: outer.endLine, column: outer.endColumn })
  );
}

function isSuperseded(
  message: ReportedMessage,
  records: readonly ReportedMessage[],
  starts: ReadonlySet<string>,
): boolean {
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

export function withoutSupersededMessages(messages: readonly unknown[]): unknown[] {
  const records = messages.filter(isMessage);
  const starts = new Set(records.map((message) => startOf(message.ruleId, message)));
  return messages.filter(
    (message) => !isMessage(message) || !isSuperseded(message, records, starts),
  );
}
