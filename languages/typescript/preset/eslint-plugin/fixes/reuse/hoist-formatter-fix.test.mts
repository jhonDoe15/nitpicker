import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/reuse/reusable-object-per-call.mts';

const NF = 'const NUMBER_FORMAT = new Intl.NumberFormat("en-US");';

function hoists(code: string, name: string, output: string) {
  return {
    code,
    errors: [
      {
        messageId: 'perCall' as const,
        suggestions: [{ messageId: 'hoistFormatter' as const, data: { name }, output }],
      },
    ],
  };
}

function declines(code: string, sourceType: 'module' | 'script' = 'module') {
  return {
    code,
    languageOptions: { sourceType },
    errors: [{ messageId: 'perCall' as const }],
  };
}

typescriptRuleTester().run('reusable-object-per-call hoist', rule, {
  valid: [],
  invalid: [
    hoists(
      'export function money(v: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v); }',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });\n\nexport function money(v: number) { return NUMBER_FORMAT.format(v); }',
    ),
    hoists(
      'export {};\nfunction show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
      'NUMBER_FORMAT',
      `${NF}\n\nexport {};\nfunction show(v: number) { return NUMBER_FORMAT.format(v); }`,
    ),
    hoists(
      'import type { Unit } from "./unit";\nfunction show(v: Unit) { return new Intl.NumberFormat("en-US").format(Number(v)); }',
      'NUMBER_FORMAT',
      `import type { Unit } from "./unit";\n\n${NF}\nfunction show(v: Unit) { return NUMBER_FORMAT.format(Number(v)); }`,
    ),
    hoists(
      'function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }\nexport default show;',
      'NUMBER_FORMAT',
      `${NF}\n\nfunction show(v: number) { return NUMBER_FORMAT.format(v); }\nexport default show;`,
    ),
    hoists(
      'export function pct(v: number) { return Intl.NumberFormat("en-US", { style: "percent" }).format(v); }',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = Intl.NumberFormat("en-US", { style: "percent" });\n\nexport function pct(v: number) { return NUMBER_FORMAT.format(v); }',
    ),
    hoists(
      'export function both(a: number, b: number) { const nf = new Intl.NumberFormat("en-US"); return nf.format(a) + nf.format(b); }',
      'NUMBER_FORMAT',
      `${NF}\n\nexport function both(a: number, b: number) {  return NUMBER_FORMAT.format(a) + NUMBER_FORMAT.format(b); }`,
    ),
    hoists(
      'export function join(xs: string[]) { return new Intl.ListFormat("en", { style: "long", type: "disjunction" }).format(xs); }',
      'LIST_FORMAT',
      'const LIST_FORMAT = new Intl.ListFormat("en", { style: "long", type: "disjunction" });\n\nexport function join(xs: string[]) { return LIST_FORMAT.format(xs); }',
    ),
    hoists(
      'export function language(c: string) { return new Intl.DisplayNames(["en"], { type: "language" }).of(c); }',
      'DISPLAY_NAMES',
      'const DISPLAY_NAMES = new Intl.DisplayNames(["en"], { type: "language" });\n\nexport function language(c: string) { return DISPLAY_NAMES.of(c); }',
    ),
    hoists(
      'import { useState } from "react";\nimport type { Props } from "./props";\n\nexport function Row({ n }: Props) { const [k] = useState(0); return new Intl.PluralRules("en-US").select(n + k); }',
      'PLURAL_RULES',
      'import { useState } from "react";\nimport type { Props } from "./props";\n\nconst PLURAL_RULES = new Intl.PluralRules("en-US");\n\nexport function Row({ n }: Props) { const [k] = useState(0); return PLURAL_RULES.select(n + k); }',
    ),
    hoists(
      'export function glyphs(t: string) { return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(t)]; }',
      'SEGMENTER',
      'const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });\n\nexport function glyphs(t: string) { return [...SEGMENTER.segment(t)]; }',
    ),
    hoists(
      'export function sort(xs: string[]) { return xs.toSorted(new Intl.Collator("de", { numeric: true }).compare); }',
      'COLLATOR',
      'const COLLATOR = new Intl.Collator("de", { numeric: true });\n\nexport function sort(xs: string[]) { return xs.toSorted(COLLATOR.compare); }',
    ),
    hoists(
      'export function ago(d: number) { return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-d, "day"); }',
      'RELATIVE_TIME_FORMAT',
      'const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });\n\nexport function ago(d: number) { return RELATIVE_TIME_FORMAT.format(-d, "day"); }',
    ),
    hoists(
      `const NUMBER_FORMAT = 1;\nexport const one = NUMBER_FORMAT;\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }`,
      'NUMBER_FORMAT2',
      `const NUMBER_FORMAT2 = new Intl.NumberFormat("en-US");\n\nconst NUMBER_FORMAT = 1;\nexport const one = NUMBER_FORMAT;\nexport function show(v: number) { return NUMBER_FORMAT2.format(v); }`,
    ),
    hoists(
      `'use client';\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }`,
      'NUMBER_FORMAT',
      `'use client';\n\n${NF}\nexport function show(v: number) { return NUMBER_FORMAT.format(v); }`,
    ),
    hoists(
      '#!/usr/bin/env node\n\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
      'NUMBER_FORMAT',
      `#!/usr/bin/env node\n\n${NF}\n\nexport function show(v: number) { return NUMBER_FORMAT.format(v); }`,
    ),
    hoists(
      'export function show(NUMBER_FORMAT: number) { return new Intl.NumberFormat("en-US").format(NUMBER_FORMAT); }',
      'NUMBER_FORMAT2',
      'const NUMBER_FORMAT2 = new Intl.NumberFormat("en-US");\n\nexport function show(NUMBER_FORMAT: number) { return NUMBER_FORMAT2.format(NUMBER_FORMAT); }',
    ),
    hoists(
      'export class Prices { show(v: number) { return new globalThis.Intl.NumberFormat("en-US").format(v); } }',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new globalThis.Intl.NumberFormat("en-US");\n\nexport class Prices { show(v: number) { return NUMBER_FORMAT.format(v); } }',
    ),
    hoists(
      'export function pct(v: number) { return new Intl.NumberFormat("en-US", { style: "percent" } as const).format(v); }',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { style: "percent" } as const);\n\nexport function pct(v: number) { return NUMBER_FORMAT.format(v); }',
    ),
    hoists(
      'import a from "a"; // keep\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }'.replace(
        ' // keep',
        '',
      ),
      'NUMBER_FORMAT',
      `import a from "a";\n\n${NF}\nexport function show(v: number) { return NUMBER_FORMAT.format(v); }`,
    ),
    hoists(
      'export const show = (vs: number[]) => vs.map((v) => new Intl.NumberFormat(["en-US", "en"]).format(v));',
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat(["en-US", "en"]);\n\nexport const show = (vs: number[]) => vs.map((v) => NUMBER_FORMAT.format(v));',
    ),
    hoists(
      'export function show(v: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: -0 + 2 }).format(v); }'.replace(
        '-0 + 2',
        '2',
      ),
      'NUMBER_FORMAT',
      'const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });\n\nexport function show(v: number) { return NUMBER_FORMAT.format(v); }',
    ),
    hoists(
      'export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).format(d); }',
      'DATE_TIME_FORMAT',
      'const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" });\n\nexport function day(d: Date) { return DATE_TIME_FORMAT.format(d); }',
    ),
    hoists(
      'export function day(d: Date) { return Intl.DateTimeFormat("de", { timeZone: "Europe/Berlin", hour: "numeric" }).format(d); }',
      'DATE_TIME_FORMAT',
      'const DATE_TIME_FORMAT = Intl.DateTimeFormat("de", { timeZone: "Europe/Berlin", hour: "numeric" });\n\nexport function day(d: Date) { return DATE_TIME_FORMAT.format(d); }',
    ),
    hoists(
      'export function days(a: Date, b: Date) { const f = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }); return f.format(a) + f.formatToParts(b).length; }',
      'DATE_TIME_FORMAT',
      'const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });\n\nexport function days(a: Date, b: Date) {  return DATE_TIME_FORMAT.format(a) + DATE_TIME_FORMAT.formatToParts(b).length; }',
    ),
    declines(
      'export function show(v: number) { const options = { maximumFractionDigits: 1 }; return new Intl.NumberFormat("en-US", options).format(v); }',
    ),
    declines(
      'const LOCALE = "en-US"; export function show(v: number) { return new Intl.NumberFormat(LOCALE).format(v); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US", { style: "currency" }).format(v); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("xx_invalid").format(v); }',
    ),
    declines(
      'export function show(v: number) { const f = new Intl.NumberFormat("en-US"); register(f); return f.format(1); }',
    ),
    declines(
      'export function cmp(a: string, b: string) { try { return new Intl.Collator("de").compare(a, b); } catch { return 0; } }',
    ),
    declines(
      'vi.spyOn(Intl, "NumberFormat"); export function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US", /* style */ {}).format(v); }',
    ),
    declines('export function show() { return String(new Intl.NumberFormat("en-US")); }'),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US")["format"](v); }',
    ),
    declines(
      'function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
      'script',
    ),
    declines('function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }'),
    declines(
      'const used = 1;\nfunction show(v: number) { return new Intl.NumberFormat("en-US").format(v + used); }',
    ),
    declines('export function show(v: number) { return Intl.PluralRules("en-US").select(v); }'),
    declines(
      'export function show(v: number) { let f = new Intl.NumberFormat("en-US"); return f.format(v); }',
    ),
    declines(
      'export function show(v: number) { const f = new Intl.NumberFormat("en-US"); return [f, f.format(v)]; }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: -1 }).format(v); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.DurationFormat("en").format({ hours: v }); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }\nimport a from "a";\nexport { a };',
    ),
    declines(
      'import a from "a"; // keep\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
    ),
    declines(
      '/** The label. */\nexport function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US").format(v); }\nexport const kinds = Intl.supportedValuesOf("currency");',
    ),
    declines(
      'export function show(v: number) { return new Intl.NumberFormat("en-US", { currency: "USD" }, 1).format(v); }',
    ),
    declines(
      'export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d); }',
    ),
    declines('export function day(d: Date) { return new Intl.DateTimeFormat("en-US").format(d); }'),
    declines(
      'export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: undefined }).format(d); }',
    ),
    declines(
      'export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: "" }).format(d); }',
    ),
    declines(
      'export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: "Nowhere/Land" }).format(d); }',
    ),
    declines(
      'const ZONE = "UTC"; export function day(d: Date) { return new Intl.DateTimeFormat("en-US", { timeZone: ZONE }).format(d); }',
    ),
  ],
});
