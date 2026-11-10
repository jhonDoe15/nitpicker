import { GOSEC_HINTS, gosecMessage } from './gosec-hints.mjs';
import { reviveHint, reviveVaryingPart } from './revive-hints.mjs';

const GO_FIX = '`go fix ./...` applies this rewrite.';
const KEEP_OR_DROP = 'Use the value or remove the assignment.';
const TAGGED_SWITCH = 'Write a tagged switch, `switch value { case 1: ... }`.';
const SPIN = 'Block on a channel, a sync primitive or a select without a default case instead.';
const OWN_FUNCTION =
  'Move the loop body into a function, so each defer runs when that function returns.';

const HINTS = new Map([
  ['QF1001', 'Negate each operand instead of the group: `!a && !b`.'],
  ['QF1002', TAGGED_SWITCH],
  ['QF1003', TAGGED_SWITCH],
  ['QF1005', 'Multiply the value by itself: `x * x`.'],
  ['QF1006', 'Move the condition into the loop header: `for index < limit { ... }`.'],
  ['QF1007', 'Declare the variable from the condition: `large := count > 10`.'],
  ['QF1008', 'Select the promoted field directly: `item.ID`.'],
  ['QF1010', 'Convert the bytes with `string(data)` before printing them.'],
  ['S1005', 'Drop the blank identifier: `for key := range values`.'],
  ['S1020', 'Drop the nil check.'],
  ['S1023', 'Remove the statement.'],
  ['S1031', 'Range over the value directly; ranging over a nil slice or map does nothing.'],
  ['S1033', 'Call delete directly; it does nothing for a missing key.'],
  ['S1036', 'Index the map directly; a missing key reads as the zero value.'],
  ['S1039', 'Use the string itself.'],
  ['S1040', 'Drop the type assertion.'],
  ['SA1011', 'Pass valid UTF-8, or use the bytes package for raw bytes.'],
  ['SA1020', 'Pass a `host:port` pair, such as `localhost:8080`.'],
  ['SA1023', 'Copy the buffer before changing it.'],
  [
    'SA1024',
    'List each character once, or use strings.TrimPrefix or TrimSuffix to remove a whole string.',
  ],
  ['SA1027', 'Use `atomic.Int64`, which is always aligned, or put the field first in the struct.'],
  ['SA1031', 'Encode into a separate buffer.'],
  ['SA1032', 'Write `errors.Is(err, target)`.'],
  ['SA2001', 'Defer the unlock: `mu.Lock(); defer mu.Unlock()`.'],
  ['SA3001', 'Loop with `for b.Loop()` and leave b.N to the testing package.'],
  ['SA4005', 'Use a pointer receiver, or return the changed value.'],
  ['SA4006', KEEP_OR_DROP],
  ['SA4009', KEEP_OR_DROP],
  ['SA4010', KEEP_OR_DROP],
  ['SA5002', SPIN],
  ['SA5003', OWN_FUNCTION],
  ['SA5004', SPIN],
  ['SA9001', OWN_FUNCTION],
  ['SA9003', 'Remove the empty branch, or put the code it was meant to run in it.'],
  ['SA9004', 'Give every constant its type, or start an iota group with a typed first constant.'],
  ['SA9005', 'Export the fields to marshal, or implement MarshalJSON.'],
  ['SA9009', 'Write the directive without the space: `//go:name`.'],
  ['SA9010', 'Keep the returned function and defer that: `stop := cleanup(); defer stop()`.'],
  [
    'ST1000',
    'Add a package comment, `// Package name ...`, to one file of the package (usually doc.go).',
  ],
  ['ST1001', 'Import the package by name and qualify what you use from it.'],
  [
    'ST1005',
    'Start error strings in lower case and end them without punctuation; they get wrapped into other messages.',
  ],
  ['ST1006', 'Name the receiver after its type, such as `account` or `a`.'],
  [
    'ST1011',
    'Name the variable for what it measures, such as `Timeout`; the type carries the unit.',
  ],
  ['ST1016', 'Use one receiver name for every method of the type.'],
  ['ST1017', 'Put the variable first: `count == 0`.'],
  ['ST1019', 'Import the package once.'],
  ['U1000', 'Delete it, or use it.'],
  [
    'errcheck',
    'Handle the error: return it (wrapped with `%w`), or join it into a named error result in a deferred call, ' +
      '`defer func() { err = errors.Join(err, file.Close()) }()`. ' +
      'Assign a type assertion to two values, `value, ok := x.(T)`.',
  ],
  ['deepequalerrors', 'Compare errors with `errors.Is`.'],
  ['reflectvaluecompare', 'Use `left.Equal(right)`, or compare the `Interface()` values.'],
  ['nilness', 'Check the value before using it, or remove the branch that cannot run.'],
  ['unusedwrite', 'Return the changed value, or use a pointer.'],
  [
    'inline',
    `Replace the call with the function's body, as its \`//go:fix inline\` directive asks. ${GO_FIX}`,
  ],
  ['forvar', 'Remove the copy; since Go 1.22 every loop iteration has its own variable.'],
  ['importcomment', 'Remove the comment.'],
  ['plusbuild', 'Remove the line; the `//go:build` line is enough.'],
  ['newexpr', 'Use `new(value)`.'],
  ['omitzero', 'Use `omitzero` instead of `omitempty`.'],
  ['embedlit', 'Set the promoted fields directly in the literal.'],
  ['stringsbuilder', 'Build the string with a `strings.Builder`.'],
  ['stringsseq', 'Range over `strings.SplitSeq` or `strings.FieldsSeq`.'],
  ...GOSEC_HINTS,
]);

const RULE_NAMES = new Map([['errcheck', 'unchecked']]);
const VARYING_PARTS = new Map([['ST1016', / \(seen [^)]*\)$/u]]);

export function lintRule(rule) {
  return RULE_NAMES.get(rule) ?? rule;
}

function sentence(message) {
  const text = message.trim().replace(/\s+/gu, ' ');
  return /[.?!]$/u.test(text) ? text : `${text}.`;
}

function hintOf(tool, rule, message) {
  if (tool === 'revive') {
    return reviveHint(rule, message);
  }
  const hint = HINTS.get(rule);
  if (tool !== 'modernize') {
    return hint;
  }
  return hint === undefined ? GO_FIX : `${hint} ${GO_FIX}`;
}

export function lintMessage({ tool, rule, message }) {
  const hint = hintOf(tool, rule, message);
  const varying = tool === 'revive' ? reviveVaryingPart(rule) : VARYING_PARTS.get(rule);
  const own = tool === 'gosec' ? gosecMessage(rule, message) : message;
  const text = sentence(varying === undefined ? own : own.replace(varying, ''));
  return hint === undefined ? text : `${text} ${hint}`;
}
