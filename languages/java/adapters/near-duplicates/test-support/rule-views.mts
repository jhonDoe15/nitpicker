import { beforeAll } from 'vitest';
import type { Unit } from '../jvm-types.mts';
import { present } from '../tree/nodes.mts';
import { decidedConditionFindings, duplicateBranchFindings } from './engine-views.mts';
import { javaParser, kotlinParser, type JvmParser } from './parse-jvm.mts';

const JAVA_FILE = 'src/main/java/shop/Rules.java';
const RULE_OPTIONS = { analyzerName: 'structure', isExcepted: () => false };

export function inClass(...lines: string[]): string {
  return ['class Rules {', ...lines, '}'].join('\n');
}

export function useRuleViews(): {
  readonly unitsOf: (text: string, file?: string) => Unit[];
  readonly decided: (text: string, file?: string) => string[];
  readonly branches: (text: string, file?: string) => string[];
} {
  const parsers: { java?: JvmParser; kotlin?: JvmParser } = {};

  beforeAll(async () => {
    parsers.java = await javaParser();
    parsers.kotlin = await kotlinParser();
  });

  function unitsOf(text: string, file = JAVA_FILE): Unit[] {
    return present(parsers[file.endsWith('.kt') ? 'kotlin' : 'java'])(text, file);
  }

  function decided(text: string, file = JAVA_FILE): string[] {
    return decidedConditionFindings(unitsOf(text, file), RULE_OPTIONS).map(
      ({ location, message }) =>
        `${String(present(location).line)}: ${String(message.split('. ')[0])}`,
    );
  }

  function branches(text: string, file = JAVA_FILE): string[] {
    return duplicateBranchFindings(unitsOf(text, file), RULE_OPTIONS).map(
      ({ location, classification, message }) =>
        `${String(present(location).line)} ${classification}: ${String(message.split(' If ')[0])}`,
    );
  }

  return { unitsOf, decided, branches };
}
