import { spawnSyncWithOutputFile } from '../tooling/output-file/output-file.mjs';
import { TOOL_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { fixTypeScript } from '../../languages/typescript/fix/typescript-fix.mts';
import { dryRun } from './dry-run/dry-run.mjs';
import { createJournal, journalWriter } from './dry-run/journal.mjs';
import { directWriter } from './engine/writer.mjs';
import { verifyFixes } from './verify/verify-fixes.mjs';
import { languageFixers } from './language-fixers.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

type Invocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly input?: string | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly shell?: boolean;
  readonly timeout?: number;
};

type FixOptions = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly dryRun?: boolean;
  readonly config?: { readonly preset?: string } | undefined;
  readonly selectedRules?: readonly string[];
  readonly executeFixCommand?: ((invocation: Invocation) => unknown) | undefined;
  readonly spawnEnvironment?: NodeJS.ProcessEnv | undefined;
  readonly analyzeFixes?: unknown;
  readonly verifyMode?: unknown;
  readonly [key: string]: unknown;
};

function spawnEnvironment(
  baseEnvironment: NodeJS.ProcessEnv | undefined,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv | undefined {
  if (baseEnvironment === undefined && Object.keys(overrides).length === 0) {
    return undefined;
  }
  return { ...baseEnvironment, ...overrides };
}

export function spawnInvocation(
  { command, args, cwd, input, environment, shell = false, timeout = TOOL_TIMEOUT_MS }: Invocation,
  baseEnvironment?: NodeJS.ProcessEnv,
  spawn: typeof spawnSyncWithOutputFile = spawnSyncWithOutputFile,
) {
  return spawn(command, args, {
    cwd,
    input,
    shell,
    timeout,
    env: spawnEnvironment(baseEnvironment, environment),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

function fixOnce(options: FixOptions): FixOutcome {
  const settings = {
    ...options,
    selectedRules: options.selectedRules ?? [],
    executeFixCommand: (invocation: Invocation) =>
      options.executeFixCommand?.(invocation) ??
      spawnInvocation(invocation, options.spawnEnvironment),
  };
  const fixer = languageFixers[settings.config?.preset as keyof typeof languageFixers];
  return fixer === undefined
    ? (fixTypeScript as (options: object) => FixOutcome)(settings)
    : fixer(settings);
}

function rewroteAny(note: string, names: ReadonlySet<string>): boolean {
  return [...names].some((name) => note.endsWith(` rewrote ${name}`));
}

type FixOutcome = {
  readonly fixedFiles: readonly string[];
  readonly fixedFindings?: readonly string[];
  readonly notes?: readonly string[];
  readonly [key: string]: unknown;
};
type RolledBack = { readonly files: readonly string[]; readonly recipe: string };

const verifyFixesOf = verifyFixes as (options: object) => {
  readonly rolledBack: readonly RolledBack[];
  readonly notes: readonly string[];
};

function withVerification(
  { analyzeFixes, verifyMode }: FixOptions,
  journal: unknown,
  result: FixOutcome,
): FixOutcome {
  if (analyzeFixes === undefined) {
    return result;
  }
  const { rolledBack, notes } = verifyFixesOf({ journal, analyze: analyzeFixes, mode: verifyMode });
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

export function fixWorkingTree(options: FixOptions) {
  const { repositoryRoot, projectRoot } = options;
  if (options.dryRun !== true && options.analyzeFixes === undefined) {
    return fixOnce({ ...options, writer: directWriter(projectRoot) });
  }
  const journal = createJournal(projectRoot);
  function run() {
    return withVerification(
      options,
      journal,
      fixOnce({ ...options, writer: journalWriter(journal) }),
    );
  }
  if (options.dryRun !== true) {
    return run();
  }
  const { result, recovered, ...plan } = dryRun({ repositoryRoot, journal, run });
  return { ...result, notes: [...recovered, ...(result.notes ?? [])], dryRun: plan };
}
