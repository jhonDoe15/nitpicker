import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ingestRulesReport } from '../../ingest/rules-report.mts';
import {
  RULES_REPORT,
  checkRules,
  readAllowances,
  readRegexSites,
  readTestFiles,
} from '../../adapters/analysis/python-ast-rules.mts';
import { ruffFindings, typeFindings } from '../../adapters/python-reports.mts';
import { RUFF_REPORT, lint } from '../../adapters/python-tools.mts';
import { TYPES_REPORT, typeCheck } from '../../adapters/python-types.mts';
import { applyRuleHints } from '../rule-hints.mts';
import { detectLibraries, type DEFAULT_LIBRARIES } from '../libraries/project-libraries.mts';
import { pytestStyle } from '../libraries/pytest-style.mts';
import { toolContext } from './python-rule-scripts.mts';
import type { ToolContext } from '../../adapters/typed/context/tool-context-types.mts';
import type { RuleCaseInput } from './python-rule-cases.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';

export type RuleVerdict = {
  readonly ok: boolean;
  readonly reason?: string;
  readonly messages: readonly string[];
};
type Side = 'banned' | 'allowed';
type Collector = (context: ToolContext, roots: readonly string[]) => IngestedFinding[];

const readTests: (reportRoot: string) => readonly string[] = readTestFiles;
const readLibraries: (root: string) => typeof DEFAULT_LIBRARIES = detectLibraries;
const styleOf: (root: string) => object = pytestStyle;
const withHints: (
  findings: IngestedFinding[],
  libraries: typeof DEFAULT_LIBRARIES,
) => IngestedFinding[] = applyRuleHints;
const readJson: (text: string) => unknown = JSON.parse;
const readTypeReport: (text: string) => {
  checker: 'mypy' | 'pyright' | 'basedpyright';
  output: string;
} = JSON.parse;

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const TYPE_CHECKERS = ['mypy', 'pyright', 'basedpyright'];
function read(reportRoot: string, name: string): string {
  const file = path.resolve(reportRoot, name);
  if (!file.startsWith(reportRoot + path.sep)) {
    throw new Error(`${name} is outside ${reportRoot}`);
  }
  return readFileSync(file, 'utf8');
}

const COLLECTORS: Record<string, Collector> = {
  ruff: (context, roots) => {
    checkRules(context);
    lint(context);
    return ruffFindings(readJson(read(context.reportRoot, RUFF_REPORT)), {
      roots,
      projectRoot: context.projectRoot,
      testFiles: readTests(context.reportRoot),
      ...readAllowances(context.reportRoot),
    });
  },
  'python-rules': (context) => {
    checkRules(context);
    return [
      ...ingestRulesReport(read(context.reportRoot, RULES_REPORT)),
      ...ingestRulesReport(readRegexSites(context.reportRoot)),
    ];
  },
  type: (context, roots) => {
    typeCheck(context);
    return typeFindings(readTypeReport(read(context.reportRoot, TYPES_REPORT)), roots);
  },
};

function fixtureRoot(fixture: string, side: Side): string {
  const full = path.resolve(fixtures, fixture, side);
  if (!full.startsWith(fixtures + path.sep)) {
    throw new Error(`Fixture ${fixture} is outside the fixtures folder`);
  }
  return full;
}

function collectFindings({ fixture, tool }: RuleCaseInput, side: Side): IngestedFinding[] {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-case-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-case-')));
  try {
    cpSync(fixtureRoot(fixture, side), projectRoot, { recursive: true });
    const isTypeChecker = TYPE_CHECKERS.includes(tool);
    const context = toolContext({
      projectRoot,
      liveRoot: projectRoot,
      settings: {
        environment: 'path',
        sourceRoots: ['.'],
        ...(isTypeChecker ? { typeChecker: tool } : {}),
      },
      reportRoot,
    });
    const collect = COLLECTORS[isTypeChecker ? 'type' : tool];
    if (collect === undefined) {
      throw new Error(`Unknown tool ${tool}`);
    }
    const libraries = { ...readLibraries(projectRoot), pytestStyle: styleOf(projectRoot) };
    return withHints(collect(context, [projectRoot]), libraries);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(reportRoot, { recursive: true, force: true });
  }
}

function verdictOf(
  testCase: RuleCaseInput,
  findingsFor: (testCase: RuleCaseInput, side: Side) => IngestedFinding[],
): RuleVerdict {
  const banned = findingsFor(testCase, 'banned').filter(({ rule }) => rule === testCase.rule);
  if (banned.length === 0) {
    return { ok: false, reason: 'banned fixture produced no finding', messages: [] };
  }
  const messages = banned.map(({ message }) => message);
  if (!messages.some((message) => message.toLowerCase().includes(testCase.mention.toLowerCase()))) {
    return { ok: false, reason: `no message names "${testCase.mention}"`, messages };
  }
  const allowed = findingsFor(testCase, 'allowed').filter(
    ({ rule }) => !testCase.alongside?.includes(rule),
  );
  if (allowed.length > 0) {
    return {
      ok: false,
      reason: 'allowed fixture produced findings',
      messages: allowed.map(({ message }) => message),
    };
  }
  return { ok: true, messages };
}

export function createRuleChecker(): (testCase: RuleCaseInput) => RuleVerdict {
  const remembered = new Map<string, IngestedFinding[]>();

  function findingsFor(testCase: RuleCaseInput, side: Side): IngestedFinding[] {
    const key = `${testCase.tool}/${testCase.fixture}/${side}`;
    const known = remembered.get(key);
    if (known !== undefined) {
      return known;
    }
    const collected = collectFindings(testCase, side);
    remembered.set(key, collected);
    return collected;
  }

  return (testCase: RuleCaseInput) => verdictOf(testCase, findingsFor);
}
