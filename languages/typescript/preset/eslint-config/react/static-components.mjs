const callCreations = new Set(['CallExpression', 'NewExpression']);

export function createdByCallOnly(rule) {
  return {
    ...rule,
    create(context) {
      const pending = { use: undefined };
      const filtered = Object.create(context, {
        report: {
          value(descriptor) {
            if (descriptor.messageId !== 'createdHere') {
              pending.use = descriptor;
              return;
            }
            if (pending.use !== undefined && callCreations.has(descriptor.node.type)) {
              context.report(pending.use);
            }
            pending.use = undefined;
          },
        },
      });
      return rule.create(filtered);
    },
  };
}
