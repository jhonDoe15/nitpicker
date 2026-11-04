import { childAt } from '../../../../shared/ingest/common.mjs';

const ARGUMENT = /(?:[^\s"']+|"[^"]*"?|'[^']*'?)+/gu;
const QUOTED = /"([^"]*)"?|'([^']*)'?/gu;
const LATE_REFERENCE = /@\{([^}]*)\}/gu;
const UNRESOLVED_REFERENCE = /[@$]\{/u;

export function argLineTokens(argLine) {
  return (argLine.match(ARGUMENT) ?? [])
    .map((token) => token.replaceAll(QUOTED, '$1$2'))
    .filter((token) => token !== '');
}

function entries(element) {
  return (element?.children ?? []).map((child) => [child.name, child.text ?? '']);
}

function propertyEntries(element) {
  return (element?.children ?? []).map((child) => {
    const name = childAt(child, 'name')?.text;
    return child.name === 'property' && name !== undefined
      ? [name, childAt(child, 'value')?.text ?? '']
      : [child.name, child.text ?? ''];
  });
}

function configured(execution, plugin, name) {
  return childAt(execution, 'configuration', name) ?? childAt(plugin, 'configuration', name);
}

export function testJvmArguments(project, plugin, execution) {
  const properties = new Map(entries(childAt(project, 'properties')));
  const argLine = configured(execution, plugin, 'argLine')?.text ?? properties.get('argLine') ?? '';
  const resolved = argLine.replaceAll(
    LATE_REFERENCE,
    (reference, name) => properties.get(name) ?? reference,
  );
  const systemProperties = [
    ...propertyEntries(configured(execution, plugin, 'systemProperties')),
    ...entries(configured(execution, plugin, 'systemPropertyVariables')),
  ].map(([name, value]) => `-D${name}=${value}`);
  return [...argLineTokens(resolved), ...systemProperties].filter(
    (argument) => !UNRESOLVED_REFERENCE.test(argument),
  );
}
