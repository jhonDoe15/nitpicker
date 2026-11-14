type ReportedMessage = {
  readonly ruleId?: unknown;
  readonly messageId?: unknown;
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly message?: unknown;
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

type MessageSuperseding = {
  readonly ruleId: string;
  readonly messagePrefixes?: readonly string[];
  readonly supersededBy: { readonly ruleId: string; readonly messagePrefixes?: readonly string[] };
  readonly within: 'enclosing' | 'start';
};

const READONLY_DOMAIN_PREFIXES = ['domain/ types are readonly', 'domain/ data types are readonly'];
const THROW_PREFIX = 'Throw an Error subclass that preserves cause';

const MESSAGE_SUPERSEDING: readonly MessageSuperseding[] = [
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

function hasPrefix(message: ReportedMessage, prefixes: readonly string[] | undefined): boolean {
  const text = message.message;
  return (
    prefixes === undefined ||
    (typeof text === 'string' && prefixes.some((prefix) => text.startsWith(prefix)))
  );
}

function isCoveredBy(
  message: ReportedMessage,
  entry: MessageSuperseding,
  records: readonly ReportedMessage[],
): boolean {
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

function isSuperseded(
  message: ReportedMessage,
  records: readonly ReportedMessage[],
  starts: ReadonlySet<string>,
): boolean {
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

export function withoutSupersededMessages(messages: readonly unknown[]): unknown[] {
  const records = messages.filter(isMessage);
  const starts = new Set(records.map((message) => startOf(message.ruleId, message)));
  return messages.filter(
    (message) => !isMessage(message) || !isSuperseded(message, records, starts),
  );
}
