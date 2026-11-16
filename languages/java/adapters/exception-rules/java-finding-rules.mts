import { listOf } from '../../../../shared/values/readers.mts';
import { configError } from '../../../../shared/config.mjs';
import { checkstyleRuleName } from '../../messages/rule-messages.mjs';
import { JAVA_TOOLS } from '../gradle-presets.mjs';

type FindingRuleEntry = { readonly rule: string; readonly paths?: unknown };

const checkstyleName: (rule: string) => string = checkstyleRuleName;

const KOTLIN_PATH = /\.kts?$/u;
const CLASS_TOOLS = new Set(['archunit', 'coupling']);

export function isJavaFindingRule(rule: string): boolean {
  const [tool = ''] = rule.split('/');
  return JAVA_TOOLS.includes(tool) && rule.length > tool.length + 1;
}

export function validateJavaFindingRule(entry: FindingRuleEntry, label: string): void {
  const [tool = ''] = entry.rule.split('/');
  const checkstyleRule = entry.rule.slice('checkstyle/'.length);
  if (tool === 'checkstyle' && checkstyleName(checkstyleRule) !== checkstyleRule) {
    throw configError(
      `"${label}" names a Checkstyle check by class; findings print the check's name, so write "checkstyle/${checkstyleName(checkstyleRule)}"`,
    );
  }
  if (
    !CLASS_TOOLS.has(tool) &&
    Array.isArray(entry.paths) &&
    entry.paths.length > 0 &&
    listOf(entry.paths).every(isKotlinPath)
  ) {
    throw configError(
      `"${label}" is a ${tool} finding, which is reported in .java files only: its paths name Kotlin sources`,
    );
  }
}

function isKotlinPath(glob: unknown): boolean {
  return typeof glob === 'string' && KOTLIN_PATH.test(glob);
}
