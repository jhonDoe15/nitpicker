import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ingestRulesReport } from '../../ingest/rules-report.mjs';
import {
  RULES_REPORT,
  checkRules,
  readAllowances,
  readTestFiles,
} from '../../adapters/analysis/python-ast-rules.mjs';
import { ruffFindings, typeFindings } from '../../adapters/python-reports.mjs';
import { RUFF_REPORT, createToolContext, lint } from '../../adapters/python-tools.mjs';
import { TYPES_REPORT, typeCheck } from '../../adapters/python-types.mjs';
import { applyRuleHints } from '../rule-hints.mjs';
import { detectLibraries } from '../libraries/project-libraries.mjs';
import { pytestStyle } from '../libraries/pytest-style.mjs';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const TYPE_CHECKERS = ['mypy', 'pyright', 'basedpyright'];
function read(reportRoot, name) {
  return readFileSync(path.join(reportRoot, name), 'utf8');
}

const COLLECTORS = {
  ruff: (context, roots) => {
    checkRules(context);
    lint(context);
    return ruffFindings(JSON.parse(read(context.reportRoot, RUFF_REPORT)), {
      roots,
      projectRoot: context.projectRoot,
      testFiles: readTestFiles(context.reportRoot),
      ...readAllowances(context.reportRoot),
    });
  },
  'python-rules': (context) => {
    checkRules(context);
    return ingestRulesReport(read(context.reportRoot, RULES_REPORT));
  },
  type: (context, roots) => {
    typeCheck(context);
    return typeFindings(JSON.parse(read(context.reportRoot, TYPES_REPORT)), roots);
  },
};

function fixtureRoot(fixture, side) {
  const full = path.resolve(fixtures, fixture, side);
  if (!full.startsWith(fixtures + path.sep)) {
    throw new Error(`Fixture ${fixture} is outside the fixtures folder`);
  }
  return full;
}

function collectFindings({ fixture, tool }, side) {
  const projectRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-case-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-case-')));
  try {
    cpSync(fixtureRoot(fixture, side), projectRoot, { recursive: true });
    const isTypeChecker = TYPE_CHECKERS.includes(tool);
    const context = createToolContext({
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
    const libraries = { ...detectLibraries(projectRoot), pytestStyle: pytestStyle(projectRoot) };
    return applyRuleHints(collect(context, [projectRoot]), libraries);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(reportRoot, { recursive: true, force: true });
  }
}

function verdictOf(testCase, findingsFor) {
  const banned = findingsFor(testCase, 'banned').filter(({ rule }) => rule === testCase.rule);
  if (banned.length === 0) {
    return { ok: false, reason: 'banned fixture produced no finding', messages: [] };
  }
  const messages = banned.map(({ message }) => message);
  if (!messages.some((message) => message.toLowerCase().includes(testCase.mention.toLowerCase()))) {
    return { ok: false, reason: `no message names "${testCase.mention}"`, messages };
  }
  const allowed = findingsFor(testCase, 'allowed');
  if (allowed.length > 0) {
    return {
      ok: false,
      reason: 'allowed fixture produced findings',
      messages: allowed.map(({ message }) => message),
    };
  }
  return { ok: true, messages };
}

export function createRuleChecker() {
  const remembered = new Map();

  function findingsFor(testCase, side) {
    const key = `${testCase.tool}/${testCase.fixture}/${side}`;
    if (!remembered.has(key)) {
      remembered.set(key, collectFindings(testCase, side));
    }
    return remembered.get(key);
  }

  return (testCase) => verdictOf(testCase, findingsFor);
}
