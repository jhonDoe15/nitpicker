import { existsSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chainOf } from '../../../shared/traversal.mjs';
import { renderJunitReport } from '../../diff/reporting/junit.mjs';
import { renderSarifReport } from '../../diff/reporting/sarif.mjs';
import { reportFolder } from '../plan/project-entry.mjs';
import { SUMMARY_FILE } from './combined-summary.mjs';

const SARIF_FILES = ['report.sarif', 'report-baseline.sarif'];
const JUNIT_FILE = 'report.junit.xml';
const TESTSUITE = /<testsuite\b[\s\S]*?<\/testsuite>/u;

function insideOutput(outputRoot, folder) {
  const full = path.resolve(outputRoot, folder);
  if (!full.startsWith(outputRoot + path.sep)) {
    return undefined;
  }
  return full;
}

function readInside(outputRoot, ...segments) {
  const full = path.resolve(outputRoot, ...segments);
  if (!full.startsWith(outputRoot + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function relocatedRun(run, id) {
  return { ...run, automationDetails: { id: `nitpicker/${id}/` } };
}

function repositoryReport(repository) {
  return {
    summary: { tools: [], elapsedMs: 0 },
    newFindings: repository?.findings ?? [],
    resolvedFindings: [],
    unchangedFindings: [],
    toolErrors: [],
  };
}

function projectRuns(outputRoot, projects, file) {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), file);
    return text === undefined
      ? []
      : JSON.parse(text).runs.map((run) => relocatedRun(run, project.path));
  });
}

function combinedSarif({ outputRoot, plan, repository }, file) {
  const runs = projectRuns(outputRoot, plan.projects, file);
  const options = { projectPath: plan.prefix };
  const policy =
    repository === undefined
      ? []
      : JSON.parse(renderSarifReport(repositoryReport(repository), options)).runs;
  if (runs.length === 0 && policy.length === 0) {
    return undefined;
  }
  const log = JSON.parse(renderSarifReport(repositoryReport(undefined), options));
  const repositoryRuns = policy.map((run) => relocatedRun(run, 'repository'));
  return `${JSON.stringify({ ...log, runs: [...runs, ...repositoryRuns] }, null, 2)}\n`;
}

function renamedSuite(text, label) {
  return TESTSUITE.exec(text)?.[0].replace(
    / name="([^"]*)"/u,
    (_match, name) => ` name="${name} ${label}"`,
  );
}

function combinedJunit({ outputRoot, plan, repository }) {
  const suites = plan.projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), JUNIT_FILE);
    return text === undefined ? [] : [renamedSuite(text, project.path)];
  });
  if (suites.length === 0) {
    return undefined;
  }
  const policy =
    repository === undefined
      ? []
      : [renamedSuite(renderJunitReport(repositoryReport(repository)), 'repository')];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    ...suites,
    ...policy,
    '</testsuites>',
    '',
  ].join('\n');
}

export function writeCombinedMachineReports(context) {
  const renders = [
    ...SARIF_FILES.map((file) => [file, combinedSarif]),
    [JUNIT_FILE, combinedJunit],
  ];
  for (const [file, render] of renders) {
    const text = render(context, file);
    if (text !== undefined) {
      writeFileSync(path.join(context.outputRoot, file), text);
    }
  }
}

function parsedSummary(text) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function previousFolders(outputRoot) {
  const text = readInside(outputRoot, SUMMARY_FILE);
  if (text === undefined) {
    return [];
  }
  const projects = parsedSummary(text).value?.projects;
  return Array.isArray(projects)
    ? projects.flatMap(({ report }) => (typeof report === 'string' ? [report] : []))
    : [];
}

function parentOf(folder) {
  const parent = path.posix.dirname(folder);
  return parent === '.' ? undefined : parent;
}

function removeEmptyFolders(outputRoot, folder) {
  for (const current of chainOf(folder, parentOf)) {
    const full = insideOutput(outputRoot, current);
    if (full === undefined || !existsSync(full) || readdirSync(full).length > 0) {
      return;
    }
    rmdirSync(full);
  }
}

export function clearStaleProjectReports({ outputRoot, plan, clearReports }) {
  const current = new Set(plan.projects.map((project) => reportFolder(project.path)));
  for (const folder of previousFolders(outputRoot).filter((entry) => !current.has(entry))) {
    const full = insideOutput(outputRoot, folder);
    if (full !== undefined) {
      clearReports(full);
      removeEmptyFolders(outputRoot, folder);
    }
  }
}
