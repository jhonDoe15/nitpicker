import { spawnSyncWithOutputFile } from '../tooling/output-file/output-file.mjs';
import { TOOL_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { fixTypeScript } from '../../languages/typescript/fix/typescript-fix.mts';
import { dryRun as untypedDryRun } from './dry-run/dry-run.mjs';
import {
  createJournal as untypedCreateJournal,
  journalWriter as untypedJournalWriter,
} from './dry-run/journal.mjs';
import { fixerError as untypedFixerError } from './common/fix-command.mjs';
import { directWriter as untypedDirectWriter } from './engine/writer.mjs';
import { lowerBaseline as untypedLowerBaseline } from './all-files/lower-baseline.mjs';
import { verifyFixes as untypedVerifyFixes } from './verify/verify-fixes.mjs';
import { languageFixers as untypedLanguageFixers } from './language-fixers.mjs';
import { ALL_RECIPES } from './engine/all-recipes.mjs';
import { emptyRuleNotes as untypedEmptyRuleNotes } from './status/rule-notes.mjs';
import type {
  DryRunPlan,
  FixInvocation,
  FixOutcome,
  FixSettings,
  FixWriter,
} from './typed/fix-types.mts';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

type Executor = (invocation: FixInvocation) => unknown;
type Journal = object;
type RolledBack = { readonly files: readonly string[]; readonly recipe: string };

type RunOptions = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly executeFixCommand: Executor | undefined;
  readonly headPolicy: unknown;
  readonly config: unknown;
  readonly scope: unknown;
  readonly environment: NodeJS.ProcessEnv;
  readonly spawnEnvironment: NodeJS.ProcessEnv | undefined;
  readonly dryRun: boolean;
  readonly selectedRules: readonly string[];
  readonly allFiles: boolean;
  readonly recipes: unknown;
  readonly analyzeFixes: unknown;
  readonly verifyMode: 'full' | 'narrow';
};

export type FixOptions = Omit<RunOptions, 'selectedRules'> & {
  readonly selectedRules: readonly string[] | undefined;
};

const dryRun: (options: {
  readonly repositoryRoot: string;
  readonly journal: Journal;
  readonly run: () => FixOutcome;
}) => { readonly result: FixOutcome; readonly recovered: readonly string[] } & DryRunPlan =
  untypedDryRun;
const createJournal: (projectRoot: string) => Journal = untypedCreateJournal;
const journalWriter: (journal: Journal) => FixWriter = untypedJournalWriter;
const directWriter: (projectRoot: string) => FixWriter = untypedDirectWriter;
const fixerError: (tool: string, error: unknown) => unknown = untypedFixerError;
const verifyFixes: (options: {
  readonly journal: Journal;
  readonly analyze: unknown;
  readonly mode: string;
}) => { readonly rolledBack: readonly RolledBack[]; readonly notes: readonly string[] } =
  untypedVerifyFixes;
const lowerBaseline: (options: {
  readonly projectRoot: string;
  readonly writer: FixWriter;
  readonly config: unknown;
  readonly selectedRules: readonly string[];
  readonly fixedFindings: readonly string[];
}) => {
  readonly notes: readonly string[];
  readonly changed: readonly string[];
  readonly errors: readonly string[];
} = untypedLowerBaseline;
const emptyRuleNotes: (options: {
  readonly selectedRules: readonly string[];
  readonly preset: string | undefined;
  readonly recipes: unknown;
  readonly result: FixOutcome;
}) => readonly string[] = untypedEmptyRuleNotes;
const languageFixers: Readonly<
  Record<string, ((settings: FixSettings) => FixOutcome) | undefined>
> = untypedLanguageFixers;
const spawn: (command: string, args: readonly string[], options: object) => unknown =
  spawnSyncWithOutputFile;

function presetOf(config: unknown): string | undefined {
  if (typeof config !== 'object' || config === null || !('preset' in config)) {
    return undefined;
  }
  return typeof config.preset === 'string' ? config.preset : undefined;
}

function spawnEnvironment(
  baseEnvironment: NodeJS.ProcessEnv | undefined,
  overrides: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv | undefined {
  const added = overrides ?? {};
  if (baseEnvironment === undefined && Object.keys(added).length === 0) {
    return undefined;
  }
  return { ...baseEnvironment, ...added };
}

export function spawnInvocation(
  { command, args, cwd, input, environment, shell, timeout = TOOL_TIMEOUT_MS }: FixInvocation,
  baseEnvironment: NodeJS.ProcessEnv | undefined,
  spawnProcess: typeof spawn = spawn,
): unknown {
  return spawnProcess(command, args, {
    cwd,
    input,
    shell: shell === true,
    timeout,
    env: spawnEnvironment(baseEnvironment, environment),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

function fixOnce(options: RunOptions, writer: FixWriter): FixOutcome {
  const settings: FixSettings = {
    ...options,
    writer,
    executeFixCommand: (invocation) =>
      options.executeFixCommand?.(invocation) ??
      spawnInvocation(invocation, options.spawnEnvironment),
  };
  const fixer = languageFixers[presetOf(options.config) ?? ''];
  return fixer === undefined ? fixTypeScript(settings) : fixer(settings);
}

function rewroteAny(note: string, names: ReadonlySet<string>): boolean {
  return [...names].some((name) => note.endsWith(` rewrote ${name}`));
}

function withVerification(options: RunOptions, journal: Journal, result: FixOutcome): FixOutcome {
  if (options.analyzeFixes === undefined) {
    return result;
  }
  const { rolledBack, notes } = verifyFixes({
    journal,
    analyze: options.analyzeFixes,
    mode: options.verifyMode,
  });
  const undone = new Set(rolledBack.flatMap(({ files }) => files));
  const undoneRecipes = new Set(rolledBack.map(({ recipe }) => `(${recipe})`));
  return {
    ...result,
    fixedFiles: result.fixedFiles.filter((name) => !undone.has(name)),
    ...(result.fixedFindings === undefined
      ? {}
      : {
          fixedFindings: result.fixedFindings.filter(
            (line) => !undoneRecipes.has(line.slice(line.lastIndexOf('('))),
          ),
        }),
    notes: [...(result.notes ?? []).filter((note) => !rewroteAny(note, undone)), ...notes],
  };
}

function withLoweredBaseline(
  options: RunOptions,
  writer: FixWriter,
  result: FixOutcome,
): FixOutcome {
  if (!options.allFiles) {
    return result;
  }
  const { notes, changed, errors } = lowerBaseline({
    projectRoot: options.projectRoot,
    writer,
    config: options.config,
    selectedRules: options.selectedRules,
    fixedFindings: result.fixedFindings ?? [],
  });
  return {
    ...result,
    fixedFiles: [...result.fixedFiles, ...changed],
    toolErrors: [
      ...result.toolErrors,
      ...errors.map((message) => fixerError('fix-baseline', new Error(message))),
    ],
    notes: [...(result.notes ?? []), ...notes],
  };
}

function withRuleNotes(options: RunOptions, result: FixOutcome): FixOutcome {
  const notes = emptyRuleNotes({
    selectedRules: options.selectedRules,
    preset: presetOf(options.config),
    recipes: options.recipes ?? ALL_RECIPES,
    result,
  });
  return notes.length === 0 ? result : { ...result, notes: [...(result.notes ?? []), ...notes] };
}

function fixInTree(options: RunOptions): FixOutcome {
  const { repositoryRoot, projectRoot } = options;
  if (!options.dryRun && options.analyzeFixes === undefined) {
    const writer = directWriter(projectRoot);
    return withLoweredBaseline(options, writer, fixOnce(options, writer));
  }
  const journal = createJournal(projectRoot);
  function run(): FixOutcome {
    const writer = journalWriter(journal);
    return withLoweredBaseline(
      options,
      writer,
      withVerification(options, journal, fixOnce(options, writer)),
    );
  }
  if (!options.dryRun) {
    return run();
  }
  const { result, recovered, ...plan } = dryRun({ repositoryRoot, journal, run });
  return { ...result, notes: [...recovered, ...(result.notes ?? [])], dryRun: plan };
}

export function fixWorkingTree(options: FixOptions): FixOutcome {
  const resolved = { ...options, selectedRules: options.selectedRules ?? [] };
  return withRuleNotes(resolved, fixInTree(resolved));
}
