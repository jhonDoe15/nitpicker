export function receiverCalls(callable, index) {
  const byReceiver = new Map();
  for (const call of callable.calls ?? []) {
    const member = index.callable(call.target);
    const owner = member?.owner === undefined ? undefined : index.type(member.owner);
    if (call.receiver !== undefined && owner !== undefined) {
      const key = `${call.receiver}\0${owner.id}`;
      const entry = byReceiver.get(key) ?? { receiver: call.receiver, owner, calls: [] };
      entry.calls.push({ ...call, member });
      byReceiver.set(key, entry);
    }
  }
  return [...byReceiver.values()];
}
