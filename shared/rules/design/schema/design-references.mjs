function duplicateId(list, items) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      return `facts.${list}[${String(index)}].id ${JSON.stringify(item.id)} is used twice: ids are unique within their list`;
    }
    seen.add(item.id);
  }
  return undefined;
}

function isSubject(typeIds, subject) {
  if (typeIds.has(subject)) {
    return true;
  }
  const dot = subject.lastIndexOf('.');
  return dot > 0 && typeIds.has(subject.slice(0, dot));
}

function callableReferences(callable) {
  return [
    ['owner', callable.owner, 'types'],
    ['forward.target', callable.forward?.target, 'callables'],
    ...(callable.calls ?? []).map((call, index) => [
      `calls[${String(index)}].target`,
      call.target,
      'callables',
    ]),
    ...(callable.paramUses ?? []).flatMap((use, index) =>
      (use.forwards ?? []).map((forward, position) => [
        `paramUses[${String(index)}].forwards[${String(position)}].target`,
        forward.target,
        'callables',
      ]),
    ),
    ...(callable.reads ?? []).map((read, index) => [
      `reads[${String(index)}].type`,
      read.type,
      'types',
    ]),
  ].filter(([, value]) => value !== undefined);
}

function danglingCallableReference(callables, ids) {
  for (const [index, callable] of callables.entries()) {
    const dangling = callableReferences(callable).find(([, value, list]) => !ids[list].has(value));
    if (dangling !== undefined) {
      const [field, value, list] = dangling;
      return `facts.callables[${String(index)}].${field} is ${JSON.stringify(value)}, which is not an id in facts.${list}: only list references the producer resolved`;
    }
    const decision = (callable.decisions ?? []).findIndex(
      ({ subject }) => !isSubject(ids.types, subject),
    );
    if (decision !== -1) {
      return `facts.callables[${String(index)}].decisions[${String(decision)}].subject is ${JSON.stringify(callable.decisions[decision].subject)}, which is neither a type id nor "<type id>.<field>"`;
    }
  }
  return undefined;
}

function unknownFile(list, items, modules) {
  if (modules === undefined) {
    return undefined;
  }
  const known = new Set(modules.map(({ file }) => file));
  const index = items.findIndex(({ file }) => !known.has(file));
  return index === -1
    ? undefined
    : `facts.${list}[${String(index)}].file is ${JSON.stringify(items[index].file)}, which is not in facts.modules: list that file in modules, or leave the entry out`;
}

export function designReferenceProblem(facts) {
  const types = facts.types ?? [];
  const callables = facts.callables ?? [];
  const modules = Array.isArray(facts.modules) ? facts.modules : undefined;
  const ids = {
    types: new Set(types.map(({ id }) => id)),
    callables: new Set(callables.map(({ id }) => id)),
  };
  return (
    duplicateId('types', types) ??
    duplicateId('callables', callables) ??
    unknownFile('types', types, modules) ??
    unknownFile('callables', callables, modules) ??
    danglingCallableReference(callables, ids)
  );
}
