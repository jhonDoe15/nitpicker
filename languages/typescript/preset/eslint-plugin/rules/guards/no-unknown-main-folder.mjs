const ALLOWED_FOLDERS = new Set(['features', 'shared', 'composition-root']);

function escaped(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Allow only features, shared and the composition root under src/main' },
    schema: [
      {
        type: 'object',
        properties: { sourceRoots: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      unknownFolder:
        "'{{folder}}/' is not a layer of this layout. Under src/main/ put code in features/<name>/ (domain/ for pure logic, adapters/ for I/O), in shared/ when several features need it, or in the composition root. If this folder is deliberate, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    const roots = context.options[0]?.sourceRoots ?? ['src'];
    const filename = context.filename.replaceAll('\\', '/');
    const pattern = new RegExp(`(?:^|/)(?:${roots.map(escaped).join('|')})/main/([^/]+)/`);
    const folder = pattern.exec(filename)?.[1];
    return {
      Program(node) {
        if (folder !== undefined && !ALLOWED_FOLDERS.has(folder)) {
          context.report({ node, messageId: 'unknownFolder', data: { folder } });
        }
      },
    };
  },
};
