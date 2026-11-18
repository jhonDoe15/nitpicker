import { decidedConditionFindings } from './engine-views.mts';
import { present } from '../tree/nodes.mts';
import { javaParser, kotlinParser } from './parse-jvm.mts';

export type Decided = (text: string, file?: string) => string[];

export async function decidedRunner(): Promise<Decided> {
  const parsers = { java: await javaParser(), kotlin: await kotlinParser() };
  return function decided(text: string, file = 'src/main/java/shop/Rules.java'): string[] {
    const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
    return decidedConditionFindings(units, {
      analyzerName: 'structure',
      isExcepted: () => false,
    }).map(
      ({ location, message }) =>
        `${String(present(location).line)}: ${String(message.split('. ')[0])}`,
    );
  };
}

export function inClass(...lines: string[]): string {
  return ['class Rules {', ...lines, '}'].join('\n');
}

export const KOTLIN_FILE = 'src/main/kotlin/shop/Rules.kt';
