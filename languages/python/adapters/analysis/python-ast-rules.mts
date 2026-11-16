import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { run } from '../execution/python-process.mts';
import { detectTargetVersion } from '../execution/python-project.mts';
import { readPackageFacts } from '../../rules/libraries/package-facts.mts';
import { ruffConfigFor } from '../configuration/python-ruff-config.mts';
import { fileURLToPath } from 'node:url';
import { fieldOf, listOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { isFinding } from '../typed/report/finding-guards.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';
import { featureRoleContract } from './typed/shared-views.mts';
import { byText } from '../../../../shared/text-order/by-text.mjs';
import { collectionOptions } from '../configuration/pytest/collection-options.mts';
import { readPytestConfig } from '../configuration/pytest/pytest-config.mts';
import { listProductionModules, testFileMatcher } from './python-sources.mts';
import { entryFilesOf } from '../../rules/libraries/entry-modules.mts';
import { startedPythonFiles } from '../../rules/started-files/started-files.mts';
import { designFiles } from './design/design-files.mts';
import { designDistributions } from './design/design-distributions.mts';
import { boundaryRoots, detectLibraries } from '../../rules/libraries/project-libraries.mts';
import { dropGeneratedFindings } from '../../libraries/generated-files.mts';
import { PUBLIC_FACES } from '../../../../shared/rules/features/feature-roles.mjs';

export const RULES_REPORT = 'rules.json';
export const ALLOWANCES_REPORT = 'rules-allowances.json';
const REGEXES_REPORT = 'rules-regexes.json';
const RULES_FAILED_RULE = 'rules-failed';
const GENERATED_EXEMPT_RULES = ['forwarding-method-alias'];
const FILE_LIST = 'python-files.txt';
const OPTIONS_FILE = 'rule-options.json';
const RULES_SCRIPT = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../rules/nitpicker_rules.py',
);

function minimumPython(projectRoot: string): [number, number] | undefined {
  const [, major, minor] = /^py(\d)(\d+)$/u.exec(detectTargetVersion(projectRoot)) ?? [];
  return major === undefined ? undefined : [Number(major), Number(minor)];
}

export function readTestFiles(reportRoot: string): string[] {
  const file = path.join(reportRoot, OPTIONS_FILE);
  return existsSync(file)
    ? textsOf(fieldOf(parseJson(readFileSync(file, 'utf8')), 'testFiles'))
    : [];
}

export function readRegexSites(reportRoot: string): string {
  const file = path.join(reportRoot, REGEXES_REPORT);
  return existsSync(file) ? readFileSync(file, 'utf8') : '[]';
}

export function readAllowances(reportRoot: string): {
  supportFiles: string[];
  allowed: readonly unknown[];
} {
  const file = path.join(reportRoot, ALLOWANCES_REPORT);
  const read = existsSync(file) ? parseJson(readFileSync(file, 'utf8')) : {};
  return {
    supportFiles: textsOf(fieldOf(read, 'supportFiles')),
    allowed: listOf(fieldOf(read, 'allowed')),
  };
}

export function pythonSources(context: ToolContext): string[] {
  const { stdout } = run(
    context,
    ['ruff', 'check', '--show-files', '--config', ruffConfigFor(context), '--no-cache', '.'],
    { rule: RULES_FAILED_RULE },
  );
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.endsWith('.py'))
    .map((line) => normalizeReportPath(line, context.projectRoot))
    .filter((file) => file !== undefined);
}

export function contractFaces(
  sources: readonly string[],
  layout: unknown,
): Record<string, string | undefined> {
  const roleOf = featureRoleContract(layout, PUBLIC_FACES.python);
  return Object.fromEntries(
    sources.flatMap((file) => {
      const role = roleOf(file);
      return role.kind === 'feature' && role.isPublic ? [[file, role.directory] as const] : [];
    }),
  );
}

function rulesOptions(
  { projectRoot, project, layout }: ToolContext,
  sources: readonly string[],
  pytestConfig: ReturnType<typeof readPytestConfig>,
): Record<string, unknown> {
  const modules = listProductionModules(projectRoot, project.sourceRoots);
  const started = startedPythonFiles(projectRoot);
  const packageFacts = readPackageFacts(projectRoot);
  return {
    sourceRoots: project.sourceRoots,
    testRunner: project.testRunner,
    ...collectionOptions(pytestConfig),
    xfailStrict: pytestConfig.xfailStrict,
    minimumPython: minimumPython(projectRoot),
    testFiles: sources.filter(testFileMatcher(projectRoot)),
    entryFiles: [
      ...new Set([
        ...entryFilesOf(sources, textsOf(project.entryPoints)),
        ...sources.filter((file) => started.files.includes(file)),
      ]),
    ],
    boundaryRoots: boundaryRoots(detectLibraries(projectRoot)),
    modules: Object.fromEntries(modules.map(({ file, module }) => [file, module])),
    contractFaces: contractFaces(sources, layout),
    ...packageFacts,
    entryModules: [...new Set([...packageFacts.entryModules, ...started.modules])].toSorted(byText),
  };
}

export function checkRules(context: ToolContext): void {
  const list = path.join(context.reportRoot, FILE_LIST);
  const options = path.join(context.reportRoot, OPTIONS_FILE);
  const sources = pythonSources(context);
  const pytestConfig = readPytestConfig(context.projectRoot);
  const design = designFiles(context, sources);
  writeFileSync(list, sources.join('\n'));
  writeFileSync(
    options,
    JSON.stringify({
      ...rulesOptions(context, sources, pytestConfig),
      designFiles: design,
      distributions: designDistributions(context.projectRoot, design),
    }),
  );
  run(
    context,
    ['python', '-I', RULES_SCRIPT, list, path.join(context.reportRoot, RULES_REPORT), options],
    { rule: RULES_FAILED_RULE },
  );
  withoutGeneratedFindings(path.join(context.reportRoot, RULES_REPORT), context.projectRoot);
}

function withoutGeneratedFindings(report: string, projectRoot: string): void {
  if (existsSync(report)) {
    const findings = listOf(parseJson(readFileSync(report, 'utf8'))).filter(isFinding);
    writeFileSync(
      report,
      JSON.stringify(dropGeneratedFindings(findings, projectRoot, GENERATED_EXEMPT_RULES)),
    );
  }
}
