import { describe, expect, it } from 'vitest';
import type { Finding } from '../../../../adapters/static-checks/shared.mts';
import { buildFixPlans as untypedBuildFixPlans } from '../../../../../../shared/fix-plans/build-fix-plans.mjs';
import { filesEnvironment as untypedFilesEnvironment } from '../../../../../../shared/fix-plans/test-support/env.mjs';
import { ruleEntry as untypedRuleEntry } from '../../../../../../shared/reference/entry.mjs';
import { indexEntries as untypedIndexEntries } from '../../../../../../shared/reference/store.mjs';
import { type ProjectFiles, findingsOf, source } from '../../test-support/reuse-project.mts';

type Copy = {
  readonly path: string;
  readonly symbol: string;
  readonly arguments: readonly { readonly parameter: string; readonly value: string }[];
};

type Signature = {
  readonly name: string;
  readonly text: string;
  readonly ownParameters: string;
  readonly addedParameters: readonly { readonly name: string }[];
};

type Plan = {
  readonly kind: string;
  readonly context: {
    readonly signature: Signature;
    readonly copies: readonly Copy[];
    readonly location: { readonly folder: string };
  };
};

const buildFixPlans: (
  findings: readonly Finding[],
  options: { readonly index: unknown; readonly env: unknown },
) => Plan[] = untypedBuildFixPlans;
const filesEnvironment: (files: ProjectFiles) => unknown = untypedFilesEnvironment;
const ruleEntry: (entry: {
  readonly tool: string;
  readonly rule: string;
  readonly page: string;
  readonly analyzers: { readonly java: readonly string[] };
  readonly summary: string;
}) => unknown = untypedRuleEntry;
const indexEntries: (entries: readonly unknown[]) => unknown = untypedIndexEntries;

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

function align(name: string, side: string): string {
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

function nearDuplicates(files: ProjectFiles) {
  return findingsOf(files).filter(({ rule }) => rule === 'near-duplicate');
}

function plansOf(files: ProjectFiles): [Plan, ...Plan[]] {
  const [first, ...rest] = buildFixPlans(nearDuplicates(files), {
    index: INDEX,
    env: filesEnvironment(files),
  });
  if (first === undefined) {
    throw new Error('Expected a fix plan');
  }
  return [first, ...rest];
}

function callerOf(
  copy: Copy,
  { signature, ownNames }: { signature: Signature; ownNames: readonly string[] },
): string {
  const values = copy.arguments.map(({ value }) => value);
  return source(
    `import { ${signature.name} } from '../../shared/${signature.name}';`,
    '',
    `export function ${copy.symbol}(elements: Element[], translate: (key: string) => string) {`,
    `  return ${signature.name}(${[...ownNames, ...values].join(', ')});`,
    '}',
  );
}

function followed(plan: Plan, files: ProjectFiles): ProjectFiles {
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
