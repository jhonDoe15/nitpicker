import { beforeAll } from 'vitest';
import type { Unit } from '../jvm-types.mts';
import { present } from '../tree/nodes.mts';
import {
  decidedConditionFindings,
  duplicateBranchFindings,
  integerSlipFindings,
  shorterConditionFindings,
} from './engine-views.mts';
import type { RuleFinding } from './engine-views.mts';
import { javaParser, kotlinParser, type JvmParser } from './parse-jvm.mts';

const JAVA_FILE = 'src/main/java/shop/Rules.java';
const RULE_OPTIONS = { analyzerName: 'structure', isExcepted: () => false };

function sentenceLines(findings: readonly RuleFinding[]): string[] {
  return findings.map(
    ({ location, message }) =>
      `${String(present(location).line)}: ${String(message.split('. ')[0])}`,
  );
}

export function inClass(...lines: string[]): string {
  return ['class Rules {', ...lines, '}'].join('\n');
}

export function useUnits(): (text: string, file?: string) => Unit[] {
  const parsers: { java?: JvmParser; kotlin?: JvmParser } = {};

  beforeAll(async () => {
    parsers.java = await javaParser();
    parsers.kotlin = await kotlinParser();
  });

  return function unitsOf(text: string, file = JAVA_FILE): Unit[] {
    return present(parsers[file.endsWith('.kt') ? 'kotlin' : 'java'])(text, file);
  };
}

export function useRuleViews(): {
  readonly unitsOf: (text: string, file?: string) => Unit[];
  readonly decided: (text: string, file?: string) => string[];
  readonly shorter: (text: string, file?: string) => string[];
  readonly slips: (text: string, file?: string) => string[];
  readonly branches: (text: string, file?: string) => string[];
} {
  const unitsOf = useUnits();

  function decided(text: string, file = JAVA_FILE): string[] {
    return sentenceLines(decidedConditionFindings(unitsOf(text, file), RULE_OPTIONS));
  }

  function shorter(text: string, file = JAVA_FILE): string[] {
    return sentenceLines(shorterConditionFindings(unitsOf(text, file), RULE_OPTIONS));
  }

  function slips(text: string, file = JAVA_FILE): string[] {
    return sentenceLines(integerSlipFindings(unitsOf(text, file), RULE_OPTIONS));
  }

  function branches(text: string, file = JAVA_FILE): string[] {
    return duplicateBranchFindings(unitsOf(text, file), RULE_OPTIONS).map(
      ({ location, classification, message }) =>
        `${String(present(location).line)} ${classification}: ${String(message.split(' If ')[0])}`,
    );
  }

  return { unitsOf, decided, shorter, slips, branches };
}
