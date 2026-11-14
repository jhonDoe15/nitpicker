import { describe, expect, it } from 'vitest';
import { buildFixPlans } from '../../../../../../shared/fix-plans/build-fix-plans.mjs';
import { filesEnvironment } from '../../../../../../shared/fix-plans/test-support/env.mjs';
import { ruleEntry } from '../../../../../../shared/reference/entry.mjs';
import { indexEntries } from '../../../../../../shared/reference/store.mjs';
import { findingsOf, source } from '../../test-support/reuse-project.mjs';

const TOP = 'src/main/features/top/align-top.ts';
const BOTTOM = 'src/main/features/bottom/align-bottom.ts';
const RENDER = 'src/main/render.ts';
const INDEX = indexEntries([
  ruleEntry({
    tool: 'structure',
    rule: 'near-duplicate',
    page: 'p',
    analyzers: { java: ['java'] },
    summary: 's',
  }),
]);

function align(name, side) {
  return source(
    "import { render, type Element } from '../../render';",
    '',
    `export function ${name}(elements: Element[], translate: (key: string) => string) {`,
    '  const selected = elements.filter((element) => !element.locked && element.visible);',
    `  const label = translate('labels.${side}');`,
    `  return render(selected, { label, shortcut: 'Shift+${side}', group: 'align' });`,
    '}',
  );
}

const FILES = {
  [TOP]: align('alignTop', 'top'),
  [BOTTOM]: align('alignBottom', 'bottom'),
  [RENDER]: source(
    'export type Element = { locked: boolean; visible: boolean };',
    'export function render(elements: Element[], options: object) {',
    '  return [elements, options];',
    '}',
  ),
};

function nearDuplicates(files) {
  return findingsOf(files).filter(({ rule }) => rule === 'near-duplicate');
}

function plansOf(files) {
  return buildFixPlans(nearDuplicates(files), { index: INDEX, env: filesEnvironment(files) });
}

function callerOf(copy, { signature, ownNames }) {
  const values = copy.arguments.map(({ value }) => value);
  return source(
    `import { ${signature.name} } from '../../shared/${signature.name}';`,
    '',
    `export function ${copy.symbol}(elements: Element[], translate: (key: string) => string) {`,
    `  return ${signature.name}(${[...ownNames, ...values].join(', ')});`,
    '}',
  );
}

function followed(plan, files) {
  const { signature, copies, location } = plan.context;
  const added = signature.addedParameters.map(({ name }) => `${name}: string`);
  const shared = source(
    "import { render, type Element } from '../render';",
    '',
    `export function ${signature.name}(${[signature.ownParameters, ...added].join(', ')}) {`,
    '  const selected = elements.filter((element) => !element.locked && element.visible);',
    '  const label = translate(text1);',
    "  return render(selected, { label, shortcut: text2, group: 'align' });",
    '}',
  );
  return {
    ...files,
    ...Object.fromEntries(
      copies.map((copy) => [
        copy.path,
        callerOf(copy, { signature, ownNames: ['elements', 'translate'] }),
      ]),
    ),
    [`${location.folder}/${signature.name}.ts`]: shared,
  };
}

describe('the extract-shared-function plan for TypeScript copies in two features', () => {
  it('names the signature, both call sites and a shared folder', () => {
    const [plan] = plansOf(FILES);

    expect(plan.kind).toBe('extract-shared-function');
    expect(plan.context.signature.text).toBe(
      'align(elements: Element[], translate: (key: string) => string, text1, text2)',
    );
    expect(plan.context.copies.map(({ path, arguments: args }) => [path, args])).toEqual([
      [
        TOP,
        [
          { parameter: 'text1', value: '"labels.top"' },
          { parameter: 'text2', value: '"Shift+top"' },
        ],
      ],
      [
        BOTTOM,
        [
          { parameter: 'text1', value: '"labels.bottom"' },
          { parameter: 'text2', value: '"Shift+bottom"' },
        ],
      ],
    ]);
    expect(plan.context.location).toEqual({
      folder: 'src/main/shared',
      kind: 'shared',
      reason:
        'the copies are in different places, and shared code may be used by several features (shared-used-by-one-feature)',
    });
  });

  it('stops the finding when an agent follows it', () => {
    const [plan] = plansOf(FILES);

    expect(nearDuplicates(FILES)).toHaveLength(1);
    expect(nearDuplicates(followed(plan, FILES))).toEqual([]);
  });

  it('keeps the function inside the feature when both copies are in one feature', () => {
    const files = {
      ...Object.fromEntries(Object.entries(FILES).filter(([name]) => name !== BOTTOM)),
      'src/main/features/top/align-bottom.ts': align('alignBottom', 'bottom'),
    };
    const [plan] = plansOf(files);

    expect(plan.context.location).toEqual({
      folder: 'src/main/features/top',
      kind: 'feature',
      reason:
        'both copies are in the top feature, so a shared folder would have one feature as its only user (shared-used-by-one-feature)',
    });
    expect(nearDuplicates(followed(plan, files))).toEqual([]);
  });
});
