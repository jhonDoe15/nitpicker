import { configError } from '../../../../shared/config.mjs';
import { checkstyleRuleName } from '../../messages/rule-messages.mjs';
import { JAVA_TOOLS } from '../gradle-presets.mjs';

const KOTLIN_PATH = /\.kts?$/u;

/** Whether `rule` is `<tool>/<rule>` of a tool whose findings name their own rules. */
export function isJavaFindingRule(rule) {
  const [tool] = rule.split('/');
  return JAVA_TOOLS.includes(tool) && rule.length > tool.length + 1;
}

/** Throws when an `exceptions` entry names a Java finding in a way that can never lift one. */
export function validateJavaFindingRule(entry, label) {
  const [tool] = entry.rule.split('/');
  const checkstyleRule = entry.rule.slice('checkstyle/'.length);
  if (tool === 'checkstyle' && checkstyleRuleName(checkstyleRule) !== checkstyleRule) {
    throw configError(
      `"${label}" names a Checkstyle check by class; findings print the check's name, so write "checkstyle/${checkstyleRuleName(checkstyleRule)}"`,
    );
  }
  if (Array.isArray(entry.paths) && entry.paths.length > 0 && entry.paths.every(isKotlinPath)) {
    throw configError(
      `"${label}" is a ${tool} finding, which is reported in .java files only: its paths name Kotlin sources`,
    );
  }
}

function isKotlinPath(glob) {
  return typeof glob === 'string' && KOTLIN_PATH.test(glob);
}
