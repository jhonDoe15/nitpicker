function groupedCalls(callable, index, keyOf) {
  const groups = new Map();
  for (const call of callable.calls ?? []) {
    const member = index.callable(call.target);
    const owner = member?.owner === undefined ? undefined : index.type(member.owner);
    if (call.receiver !== undefined && owner !== undefined) {
      const key = keyOf(call.receiver, owner);
      const entry = groups.get(key) ?? { receiver: call.receiver, owner, calls: [] };
      entry.calls.push({ ...call, member, owner });
      groups.set(key, entry);
    }
  }
  return [...groups.values()];
}

export function receiverCalls(callable, index) {
  return groupedCalls(callable, index, (receiver, owner) => `${receiver}\0${owner.id}`);
}

export function receiverValueCalls(callable, index) {
  return groupedCalls(callable, index, (receiver) => receiver);
}

export function lineage(index, type) {
  const found = [type];
  const seen = new Set([type.id]);
  for (const current of found) {
    const parents = (current.supertypes ?? [])
      .filter((id) => !seen.has(id))
      .map((id) => index.type(id))
      .filter((parent) => parent !== undefined);
    for (const parent of parents) {
      seen.add(parent.id);
      found.push(parent);
    }
  }
  return found;
}
