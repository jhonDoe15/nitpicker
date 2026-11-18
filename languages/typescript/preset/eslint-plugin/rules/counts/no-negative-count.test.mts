import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-negative-count.mts';

const ruleTester = typescriptRuleTester();

const invalid = [
  'const line = "=".repeat(width - text.length);',
  'function pad(text, width) { return " ".repeat(width - text.length) + text; }',
  'function pad(text, width) { const gap = width - text.length; return " ".repeat(gap) + text; }',
  'function fill(a, b) { return new Array(a.length - b.length); }',
  'function fill(a, b) { return Array(a - b); }',
  'function line(width, used, extra) { return "-".repeat(width - used + extra); }',
  'function pad(text, width) { if (text) { return " ".repeat(width - text.length); } return ""; }',
  'function pad(text, width) { if (width > 10) { return ""; } return "=".repeat(width - text.length); }',
];

const valid = [
  'function pad(text, width) { return " ".repeat(Math.max(0, width - text.length)) + text; }',
  'function pad(text, width) { const gap = Math.max(0, width - text.length); return " ".repeat(gap) + text; }',
  'function pad(text, width) { if (width > text.length) { return " ".repeat(width - ' +
    'text.length) + text; } return text; }',
  'function pad(text, width) { const gap = width - text.length; if (gap > 0) { ' +
    'return " ".repeat(gap) + text; } return text; }',
  'function pad(text, width) { const gap = width - text.length; return gap > 0 ? " ".repeat(gap) + text : text; }',
  'function pad(text, width) { if (text.length >= width) { return text; } return " ' +
    '".repeat(width - text.length) + text; }',
  'function pad(text, width) { return text.length < width && " ".repeat(width - text.length); }',
  'function indent(level) { return "  ".repeat(level - 1); }',
  'function make(n) { return new Array(n); }',
  'function make() { return new Array(10 - 2); }',
  'function pad(text, width) { return " ".repeat(Math.abs(width - text.length)); }',
  'function other(list, a, b) { return list.take(a - b); }',
  'function pad(a, b) { return " ".repeat(a - b, 1); }',
  'function pad(s, maxLen) { return " ".repeat(maxLen - s.length) + s; }',
  'function pad(s, cells) { return " ".repeat(lengths[0] - cells.length) + s; }',
  'function pad(s, rows) { const widest = Math.max(...rows); return " ".repeat(widest - s.length); }',
  'function bar(w, p) { const filled = Math.round(w * p); return "-".repeat(w - filled); }',
];

ruleTester.run('no-negative-count', rule, {
  valid: cases(valid),
  invalid: invalid.map((code) => ({ code, errors: [{ messageId: 'negativeCount' as const }] })),
});
