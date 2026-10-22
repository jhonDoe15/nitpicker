import { REPORT_ONLY_DESIGN_RULES } from '../../project-rules/design/design-rules.mjs';
import { exceptionHint } from '../exceptions.mjs';
import { nextOccurrence } from '../finding-helpers.mjs';

export function designFindingFactory(context) {
  const occurrences = new Map();
  return ({ rule, path, identity, symbol, line, message, enforceable }) => {
    if (context.isExcepted(rule, path)) {
      return [];
    }
    const occurrence = nextOccurrence(occurrences, `${rule}\0${path}\0${identity}`);
    const reportOnly = enforceable !== true && REPORT_ONLY_DESIGN_RULES.includes(rule);
    return [
      {
        tool: context.analyzerName,
        rule,
        path,
        identity: occurrence === 1 ? identity : `${identity}#${String(occurrence)}`,
        message: `${message} ${exceptionHint(rule, path)}`,
        classification: reportOnly ? 'descriptive' : 'enforceable',
        ...(symbol === undefined ? {} : { symbol }),
        ...(line === undefined ? {} : { location: { line } }),
      },
    ];
  };
}

export function quoted(names) {
  const items = names.map((name) => `\`${name}\``);
  if (items.length <= 2) {
    return items.join(' and ');
  }
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
