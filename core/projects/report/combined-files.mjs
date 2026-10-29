import { existsSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chainOf } from '../../../shared/traversal.mjs';
import { renderJunitReport } from '../../diff/reporting/junit.mjs';
import { renderSarifReport } from '../../diff/reporting/sarif.mjs';
import { reportFolder } from '../plan/project-entry.mjs';
import { SUMMARY_FILE } from './combined-summary.mjs';

const SARIF_FILE = 'report.sarif';
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

function prefixed(repoPath, uri) {
  return repoPath === '.' ? uri : `${repoPath}/${uri}`;
}

function relocatedRun(run, { id, repoPath }) {
  return {
    ...run,
    automationDetails: { id: `nitpicker/${id}/` },
    results: run.results.map((result) => ({
      ...result,
      locations: result.locations.map((location) => ({
        ...location,
        physicalLocation: {
          ...location.physicalLocation,
          artifactLocation: {
            uri: prefixed(repoPath, location.physicalLocation.artifactLocation.uri),
          },
        },
      })),
    })),
  };
}

function repositoryReport(repository) {
  return {
    summary: { tools: [], elapsedMs: 0 },
    newFindings: repository?.findings ?? [],
    toolErrors: [],
  };
}

function projectRuns(outputRoot, projects) {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), SARIF_FILE);
    return text === undefined
      ? []
      : JSON.parse(text).runs.map((run) =>
          relocatedRun(run, { id: project.path, repoPath: project.repoPath }),
        );
  });
}

function combinedSarif({ outputRoot, plan, repository }) {
  const runs = projectRuns(outputRoot, plan.projects);
  const policy =
    repository === undefined
      ? []
      : JSON.parse(renderSarifReport(repositoryReport(repository))).runs;
  if (runs.length === 0 && policy.length === 0) {
    return undefined;
  }
  const log = JSON.parse(renderSarifReport(repositoryReport(undefined)));
  const repositoryRuns = policy.map((run) =>
    relocatedRun(run, { id: 'repository', repoPath: plan.prefix }),
  );
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
  for (const [file, render] of [
    [SARIF_FILE, combinedSarif],
    [JUNIT_FILE, combinedJunit],
  ]) {
    const text = render(context);
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
