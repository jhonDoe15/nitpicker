import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Fields } from '../../scripts/json/fields.mts';
import { type Preset, quickAnalyzersOf } from '../lib/presets.mts';
import { linkedTree, linkedWorkdir } from '../lib/workdirs.mts';
import { loadTree } from '../detectors/tree.mts';
import { runCase } from '../runner/run-case.mts';
import { checkoutModulePath } from '../../shared/paths/checkout-module.mjs';
import {
  type CaseDefinition,
  loadCase,
  referenceTree,
} from '../case-definition/case-definition.mts';

export type RunRecord = ReturnType<typeof runCase>;

type Trees = ReturnType<typeof loadTree>;

type ReferenceTrees = {
  readonly caseDefinition: CaseDefinition;
  readonly fixture: Trees;
  readonly final: Trees;
  readonly reference: ReturnType<typeof referenceTree>;
};

export { linkedWorkdir };

export const casesDirectory = import.meta.dirname;
export const packageRoot = path.resolve(casesDirectory, '..', '..');
export const strictCleanRoot = path.join(
  packageRoot,
  'languages',
  'typescript',
  'preset',
  'fixtures',
  'strict-clean',
);
export const referenceAgent = path.join(casesDirectory, '..', 'runner', 'reference-agent.mts');
const FULL_GATE_INCLUDING_MUTATION = process.env['NITPICKER_EVAL_FULL_GATE'] === '1';

export function analyzerArgumentsWithout(
  skipped: readonly string[] = [],
  onlyFindingSources: readonly string[] | undefined = undefined,
  preset: Preset = 'typescript',
): string[] {
  if (FULL_GATE_INCLUDING_MUTATION) {
    return [];
  }
  return quickAnalyzersOf(preset)
    .filter(
      (name) =>
        !skipped.includes(name) &&
        (onlyFindingSources === undefined || onlyFindingSources.includes(name)),
    )
    .flatMap((name) => ['--analyzer', name]);
}
export const CASE_TIMEOUT_MS = 600_000;

type GateSelection = {
  readonly withoutAnalyzers?: readonly string[] | undefined;
  readonly onlyAnalyzers?: readonly string[] | undefined;
  readonly rule?: string | undefined;
};

const sourcePath: (file: string) => string = checkoutModulePath;

function gateCommand(
  preset: Preset,
  { withoutAnalyzers, onlyAnalyzers, rule }: GateSelection,
): string[] {
  return [
    'node',
    sourcePath(path.join(packageRoot, 'core', 'cli.mjs')),
    '--base',
    'main',
    ...analyzerArgumentsWithout(withoutAnalyzers, onlyAnalyzers, preset),
    ...(rule === undefined ? [] : ['--rule', rule]),
  ];
}

type ReferenceRunOptions = {
  readonly overlay?: string | undefined;
  readonly withoutAnalyzers?: readonly string[] | undefined;
  readonly rule?: string | undefined;
};

export function runReference(
  caseId: string,
  { overlay, withoutAnalyzers, rule }: ReferenceRunOptions = {},
): RunRecord {
  const caseDefinition = loadCase(path.join(casesDirectory, caseId));
  return runCase({
    caseDefinition,
    agentCommand: ['node', referenceAgent, ...(overlay ? ['--overlay', overlay] : [])],
    prepareWorkdir: linkedWorkdir(),
    gateCommand: gateCommand(caseDefinition.preset, {
      withoutAnalyzers: withoutAnalyzers,
      rule,
    }),
    tier: 'reference',
    model: overlay ? `cheat-${overlay}` : 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}

function overlayDirectories(caseDefinition: CaseDefinition, overlay: string | undefined): string[] {
  return [
    path.join(caseDefinition.directory, 'reference'),
    ...(overlay ? [path.join(caseDefinition.directory, 'cheats', overlay)] : []),
  ];
}

export function referenceTrees(
  caseId: string,
  { overlay }: { readonly overlay?: string | undefined } = {},
): ReferenceTrees {
  const caseDefinition = loadCase(path.join(casesDirectory, caseId));
  const fixture = linkedTree(caseDefinition);
  const final = new Map(fixture);
  for (const directory of overlayDirectories(caseDefinition, overlay)) {
    if (!existsSync(directory)) {
      throw new Error(`${caseId} has no ${directory}`);
    }
    for (const [file, text] of loadTree(directory)) {
      final.set(file, text);
    }
  }
  return { caseDefinition, fixture, final, reference: referenceTree(caseDefinition, fixture) };
}

type AppliedRunOptions = ReferenceRunOptions & {
  readonly analyzers?: readonly string[] | undefined;
  readonly casesRoot?: string;
};

export function runApplied(
  caseId: string,
  {
    overlay,
    withoutAnalyzers,
    analyzers,
    rule,
    casesRoot = casesDirectory,
  }: AppliedRunOptions = {},
): RunRecord {
  const caseDefinition = loadCase(path.join(casesRoot, caseId));
  const copies = overlayDirectories(caseDefinition, overlay)
    .map((directory) => `cp -R ${JSON.stringify(`${directory}/.`)} .`)
    .join(' && ');
  return runCase({
    caseDefinition,
    agentCommand: `cat > /dev/null && ${copies}`,
    prepareWorkdir: linkedWorkdir(),
    gateCommand: gateCommand(caseDefinition.preset, {
      withoutAnalyzers: withoutAnalyzers,
      onlyAnalyzers: analyzers,
      rule,
    }),
    tier: 'reference',
    model: overlay ? `cheat-${overlay}` : 'reference-solution',
    nitpickerVersion: '0.0.0',
  });
}

export function missingShortcuts(
  expected: readonly Fields[],
  shortcuts: readonly Fields[],
): Fields[] {
  function reported(shortcut: Fields): boolean {
    return shortcuts.some((found) =>
      Object.entries(shortcut).every(([key, value]) => found[key] === value),
    );
  }
  return expected.filter((shortcut) => !reported(shortcut));
}
