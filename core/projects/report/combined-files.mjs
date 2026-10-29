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
const FINDING_CASE = /(classname="quality\.diff\.new-findings" name="[^" ]+ )/gu;
const REPOSITORY_CATEGORY = 'nitpicker-repository/';
const REPOSITORY_SUITE = '(repository policy)';

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

function relocatedRun(run, category) {
  return { ...run, automationDetails: { id: category } };
}

function repositoryReport(repository) {
  return {
    summary: { tools: [], elapsedMs: 0 },
    newFindings: repository?.findings ?? [],
    resolvedFindings: [],
    unchangedFindings: [],
    toolErrors: repository?.toolErrors ?? [],
  };
}

function projectRuns(outputRoot, projects, file) {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), file);
    return text === undefined
      ? []
      : JSON.parse(text).runs.map((run) => relocatedRun(run, `nitpicker/${project.path}/`));
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
  const repositoryRuns = policy.map((run) => relocatedRun(run, REPOSITORY_CATEGORY));
  return `${JSON.stringify({ ...log, runs: [...runs, ...repositoryRuns] }, null, 2)}\n`;
}

function escapedXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renamedSuite(text, label) {
  return TESTSUITE.exec(text)?.[0].replace(
    / name="([^"]*)"/u,
    (_match, name) => ` name="${name} ${escapedXml(label)}"`,
  );
}

function fromRepositoryRoot(suite, repoPath) {
  return repoPath === '.'
    ? suite
    : suite.replaceAll(FINDING_CASE, (start) => `${start}${escapedXml(repoPath)}/`);
}

function projectSuites(outputRoot, projects) {
  return projects.flatMap((project) => {
    const text = readInside(outputRoot, reportFolder(project.path), JUNIT_FILE);
    const suite = text === undefined ? undefined : renamedSuite(text, project.path);
    return suite === undefined ? [] : [fromRepositoryRoot(suite, project.repoPath)];
  });
}

function combinedJunit({ outputRoot, plan, repository }) {
  const suites = projectSuites(outputRoot, plan.projects);
  const policy =
    repository === undefined
      ? []
      : [
          fromRepositoryRoot(
            renamedSuite(renderJunitReport(repositoryReport(repository)), REPOSITORY_SUITE),
            plan.prefix,
          ),
        ];
  if (suites.length === 0 && policy.length === 0) {
    return undefined;
  }
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
