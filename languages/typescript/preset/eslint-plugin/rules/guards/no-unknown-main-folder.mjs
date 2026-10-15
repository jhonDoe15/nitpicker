const ALLOWED_FOLDERS = new Set(['features', 'shared', 'composition-root']);
const ROOT_FILE = /^(?:main|server|composition-root|index)\.[cm]?[jt]sx?$/;

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
      looseFile:
        "'{{folder}}' sits directly in src/main/, which holds only features/, shared/ and the composition root (composition-root.ts, main.ts, server.ts) and index.ts. Move it into the feature that uses it, or into shared/ when several features need it. If the file is deliberate, add an exception for this rule in nitpicker.config.json.",
      unknownFolder:
        "'{{folder}}/' is not a layer of this layout. Under src/main/ put code in features/<name>/ (domain/ for pure logic, adapters/ for I/O), in shared/ when several features need it, or in the composition root. If this folder is deliberate, add an exception for this rule in nitpicker.config.json.",
    },
  },
  create(context) {
    const roots = context.options[0]?.sourceRoots ?? ['src'];
    const filename = context.filename.replaceAll('\\', '/');
    const pattern = new RegExp(`(?:^|/)(?:${roots.map(escaped).join('|')})/main/([^/]+)(/?)`);
    const [, folder, separator] = pattern.exec(filename) ?? [];
    const messageId = separator === '/' ? 'unknownFolder' : 'looseFile';
    const allowed = separator === '/' ? ALLOWED_FOLDERS.has(folder) : ROOT_FILE.test(folder ?? '');
    return {
      Program(node) {
        if (folder !== undefined && !allowed) {
          context.report({ node, messageId, data: { folder } });
        }
      },
    };
  },
};
