export function fixable(descriptor, plan) {
  return plan === undefined ? descriptor : { ...descriptor, fix: plan };
}

export function suggestible(descriptor, { messageId, plan, data }) {
  if (plan === undefined) {
    return descriptor;
  }
  return {
    ...descriptor,
    suggest: [{ messageId, ...(data === undefined ? {} : { data }), fix: plan }],
  };
}
