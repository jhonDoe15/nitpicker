const callCreations = new Set(['CallExpression', 'NewExpression']);

export function createdByCallOnly(rule) {
  return {
    ...rule,
    create(context) {
      const pending = new Map();
      const filtered = Object.create(context, {
        report: {
          value(descriptor) {
            if (descriptor.messageId !== 'createdHere') {
              pending.set('use', descriptor);
              return;
            }
            const use = pending.get('use');
            pending.delete('use');
            if (use !== undefined && callCreations.has(descriptor.node.type)) {
              context.report(use);
            }
          },
        },
      });
      return rule.create(filtered);
    },
  };
}
