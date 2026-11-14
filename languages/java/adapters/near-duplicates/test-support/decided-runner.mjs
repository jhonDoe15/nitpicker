import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { javaParser, kotlinParser } from './parse-jvm.mjs';

export async function decidedRunner() {
  const parsers = { java: await javaParser(), kotlin: await kotlinParser() };
  return function decided(text, file = 'src/main/java/shop/Rules.java') {
    const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
    return decidedConditionFindings(units, {
      analyzerName: 'structure',
      isExcepted: () => false,
    }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
  };
}

export function inClass(...lines) {
  return ['class Rules {', ...lines, '}'].join('\n');
}

export const KOTLIN_FILE = 'src/main/kotlin/shop/Rules.kt';
