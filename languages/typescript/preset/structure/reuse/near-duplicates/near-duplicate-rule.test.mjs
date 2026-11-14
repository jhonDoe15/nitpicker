import { describe, expect, it } from 'vitest';
import {
  bothSides,
  exceptionFor,
  findingsOf,
  newFindings,
  rows,
  source,
} from '../../test-support/reuse-project.mjs';

const RULE = 'near-duplicate';
const TOP = 'src/toolbar/align-top.ts';
const BOTTOM = 'src/toolbar/align-bottom.ts';
const RENDER = "import { render, type Element } from '../render';";

function align(name, side, renderImport = RENDER) {
  return source(
    renderImport,
    '',
    `export function ${name}(elements: Element[], translate: (key: string) => string) {`,
    '  const selected = elements.filter((element) => !element.locked && element.visible);',
    `  const label = translate('labels.${side}');`,
    `  return render(selected, { label, shortcut: 'Shift+${side}', group: 'align' });`,
    '}',
  );
}

const COPIES = {
  [TOP]: align('alignTop', 'top'),
  [BOTTOM]: align('alignBottom', 'bottom'),
  'src/render.ts': source(
    'export type Element = { locked: boolean; visible: boolean };',
    'export function render(elements: Element[], options: object) {',
    '  return [elements, options];',
    '}',
  ),
};

function nearDuplicates(files, policy) {
  return findingsOf(files, policy).filter(({ rule }) => rule === RULE);
}

describe('near-duplicate in TypeScript and JavaScript', () => {
  it('reports a copied function that differs in literals once, at the copy that sorts last', () => {
    const findings = nearDuplicates(COPIES);

    expect(rows(findings)).toEqual([[RULE, TOP, `${RULE}:${BOTTOM}#alignBottom|${TOP}#alignTop`]]);
    expect(findings[0].message).toBe(
      [
        `alignTop is a copy of alignBottom (${BOTTOM}:3) apart from 2 values`,
        '("labels.top" / "labels.bottom" and "Shift+top" / "Shift+bottom").',
        'Extract one function that takes the differing values as parameters, and call it from',
        `both places. If this is intended, add ${exceptionFor(RULE, TOP)}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
    expect(findings[0].location).toEqual({ line: 3 });
  });

  it('counts a call to a function imported from another module as a difference', () => {
    const otherRender = "import { render, type Element } from '../draw';";
    const files = {
      ...COPIES,
      [BOTTOM]: align('alignBottom', 'top', otherRender),
      'src/draw.ts': COPIES['src/render.ts'],
    };

    expect(nearDuplicates(files)[0].message).toBe(
      [
        `alignTop is a copy of alignBottom (${BOTTOM}:3) apart from 1 value`,
        '(render.ts#render / draw.ts#render). Extract one function that takes the differing values',
        `as parameters, and call it from both places. If this is intended, add ${exceptionFor(RULE, TOP)}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('reports a copy only once it is new, not one the base already had', () => {
    const base = { 'src/render.ts': COPIES['src/render.ts'], [BOTTOM]: COPIES[BOTTOM] };

    expect(rows(newFindings(bothSides(base, COPIES))).filter(([rule]) => rule === RULE)).toEqual([
      [RULE, TOP, `${RULE}:${BOTTOM}#alignBottom|${TOP}#alignTop`],
    ]);
    expect(newFindings(bothSides(COPIES, COPIES))).toEqual([]);
  });

  it('leaves out test files and excepted copies', () => {
    const tests = { ...COPIES, [TOP]: undefined, 'src/toolbar/align-top.test.ts': COPIES[TOP] };
    const exceptions = [{ rule: RULE, paths: [TOP], reason: 'toolbar actions stay apart' }];

    expect(nearDuplicates(JSON.parse(JSON.stringify(tests)))).toEqual([]);
    expect(nearDuplicates(COPIES, { exceptions })).toEqual([]);
  });

  it('reads JavaScript files the same way', () => {
    const javascript = Object.fromEntries(
      Object.entries(COPIES).map(([file, text]) => [
        file.replace(/\.ts$/u, '.js'),
        text
          .replace(', type Element', '')
          .replaceAll(/: Element\[\]|: \(key: string\) => string|: object/gu, '')
          .replace(/^export type .*\n/mu, ''),
      ]),
    );

    expect(rows(nearDuplicates(javascript))).toEqual([
      [
        RULE,
        'src/toolbar/align-top.js',
        `${RULE}:src/toolbar/align-bottom.js#alignBottom|src/toolbar/align-top.js#alignTop`,
      ],
    ]);
  });
});
