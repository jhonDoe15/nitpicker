import { beforeAll } from 'vitest';
import { type GoParse, type RuleFindings, goParser, inPackage } from './parse-go.mts';

function firstSentence(message: string): string {
  return message.split('. ')[0] ?? '';
}

export function ruleLines(
  rule: RuleFindings,
  analyzerName: string,
  summary: (message: string) => string = firstSentence,
): (...lines: readonly string[]) => string[] {
  let parse: GoParse;

  beforeAll(async () => {
    parse = await goParser();
  });

  return (...lines) =>
    rule(parse(inPackage(...lines)), { analyzerName, isExcepted: () => false }).map(
      ({ location, message }) => `${String(location?.line)}: ${summary(message)}`,
    );
}
