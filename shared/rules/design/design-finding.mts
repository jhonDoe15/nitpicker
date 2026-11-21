import { REPORT_ONLY_DESIGN_RULES } from '../../project-rules/design/design-rules.mts';
import { exceptionHint } from '../exceptions.mts';
import { occurrenceCounter } from '../finding-parts.mts';
import type { RuleContext } from '../facts/typed/fact-types.mts';
import type { DesignFinding } from './typed/design-types.mts';

export function designFindingFactory(context: RuleContext): DesignFinding {
  const nextOccurrence = occurrenceCounter();
  return ({ rule, path, identity, symbol, line, message }) => {
    if (context.isExcepted(rule, path)) {
      return [];
    }
    const occurrence = nextOccurrence(`${rule}\0${path}\0${identity}`);
    return [
      {
        tool: context.analyzerName,
        rule,
        path,
        identity: occurrence === 1 ? identity : `${identity}#${String(occurrence)}`,
        message: `${message} ${exceptionHint(rule, path)}`,
        classification: REPORT_ONLY_DESIGN_RULES.includes(rule) ? 'descriptive' : 'enforceable',
        ...(symbol === undefined ? {} : { symbol }),
        ...(line === undefined ? {} : { location: { line } }),
      },
    ];
  };
}

export function quoted(names: readonly string[]): string {
  const items = names.map((name) => `\`${name}\``);
  if (items.length <= 2) {
    return items.join(' and ');
  }
  return `${items.slice(0, -1).join(', ')} and ${String(items.at(-1))}`;
}
