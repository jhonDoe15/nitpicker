import { readFileSync } from 'node:fs';

const TRIGGER_DEPTH = 2;
const SETTING_DEPTH = 4;
const PUSH = /^ {2}push:\s*$/u;
const PATHS = /^ {4}paths:\s*$/u;
export type ChangedFile = { readonly filename: string; readonly previous_filename?: string };

export type Changes = {
  readonly entries: readonly (readonly string[])[];
  readonly total: number | undefined;
};

export type Selection = { readonly run: boolean; readonly reason: string };

export type WorkflowScript = {
  readonly github: {
    readonly rest: { readonly pulls: { readonly listFiles: unknown } };
    readonly paginate: (
      method: unknown,
      options: Readonly<Record<string, unknown>>,
    ) => Promise<readonly ChangedFile[]>;
  };
  readonly context: {
    readonly eventName: string;
    readonly repo: { readonly owner: string; readonly repo: string };
    readonly payload: {
      readonly pull_request?: { readonly number: number; readonly changed_files: number };
    };
  };
  readonly core: {
    readonly notice: (message: string) => void;
    readonly warning: (message: string) => void;
    readonly setOutput: (name: string, value: string) => void;
  };
  readonly workflow: string;
};

const ENTRY = /^ {6}- (?:'([^']+)'|"([^"]+)"|([^\s#]+))\s*(?:#.*)?$/u;

function endsBlock(line: string, depth: number): boolean {
  const text = line.trim();
  return text !== '' && !text.startsWith('#') && !line.startsWith(' '.repeat(depth + 1));
}

function blockAfter(lines: readonly string[], start: number, depth: number): string[] {
  const end = lines.findIndex((line, index) => index > start && endsBlock(line, depth));
  return lines.slice(start + 1, end === -1 ? lines.length : end);
}

export function pushPaths(workflowText: string): string[] {
  const lines = workflowText.split(/\r?\n/u);
  const push = lines.findIndex((line) => PUSH.test(line));
  if (push === -1) {
    return [];
  }
  const trigger = blockAfter(lines, push, TRIGGER_DEPTH);
  const paths = trigger.findIndex((line) => PATHS.test(line));
  if (paths === -1) {
    return [];
  }
  return blockAfter(trigger, paths, SETTING_DEPTH)
    .map((line) => ENTRY.exec(line))
    .flatMap((match) => match?.[1] ?? match?.[2] ?? match?.[3] ?? []);
}

function globExpression(glob: string): RegExp {
  const parts = glob.split(/(\*\*\/?|\*|\?)/u).map((part) => {
    if (part.startsWith('**')) {
      return part.endsWith('/') ? '(?:.*/)?' : '.*';
    }
    if (part === '*') {
      return '[^/]*';
    }
    if (part === '?') {
      return '[^/]';
    }
    return part.replaceAll(/[.+^${}()|[\]\\]/gu, '\\$&');
  });
  return new RegExp(`^${parts.join('')}$`, 'u');
}

export function matchesPaths(file: string, patterns: readonly string[]): boolean {
  let matched = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (globExpression(negated ? pattern.slice(1) : pattern).test(file)) {
      matched = !negated;
    }
  }
  return matched;
}

export function selectJobs({
  event,
  changes,
  patterns,
}: {
  readonly event: string;
  readonly changes: Changes | undefined;
  readonly patterns: readonly string[];
}): Selection {
  if (event !== 'pull_request') {
    return { run: true, reason: `a ${event} run checks everything` };
  }
  if (changes === undefined) {
    return { run: true, reason: 'the changed files could not be listed, so everything runs' };
  }
  if (changes.total === undefined || changes.entries.length < changes.total) {
    const listed = `${String(changes.entries.length)} of ${String(changes.total)}`;
    return { run: true, reason: `GitHub lists ${listed} changed files, so everything runs` };
  }
  if (patterns.length === 0) {
    return {
      run: true,
      reason: 'the workflow has no push paths to compare with, so everything runs',
    };
  }
  const trigger = changes.entries.flat().find((file) => matchesPaths(file, patterns));
  if (trigger !== undefined) {
    return { run: true, reason: `${trigger} is in the workflow's paths` };
  }
  return {
    run: false,
    reason: `none of the ${String(changes.total)} changed files is in the workflow's paths, so its jobs are skipped`,
  };
}

async function listChanges({
  github,
  context,
  core,
}: WorkflowScript): Promise<Changes | undefined> {
  const pullRequest = context.payload.pull_request;
  try {
    const files = await github.paginate(github.rest.pulls.listFiles, {
      ...context.repo,
      pull_number: pullRequest?.number,
      per_page: 100,
    });
    return {
      entries: files.map((file) => [file.filename, file.previous_filename ?? ''].filter(Boolean)),
      total: pullRequest?.changed_files,
    };
  } catch (error) {
    core.warning(
      `Listing the pull request's files failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

export async function selectWorkflowJobs(script: WorkflowScript): Promise<boolean> {
  const { context, core, workflow } = script;
  const event = context.eventName;
  const { run, reason } = selectJobs({
    event,
    changes: event === 'pull_request' ? await listChanges(script) : undefined,
    patterns: pushPaths(readFileSync(workflow, 'utf8')),
  });
  core.notice(`${workflow}: ${reason}.`);
  core.setOutput('run', String(run));
  return run;
}
