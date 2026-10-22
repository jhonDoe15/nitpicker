import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { placeFile } from './place-file.mjs';

export function renderConfig(config) {
  const entries = Object.entries(config).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{ ${entries.join(', ')} }\n`;
}

function parsedPreset(text) {
  try {
    return { kind: 'parsed', preset: JSON.parse(text)?.preset };
  } catch (error) {
    return { kind: 'invalid', error };
  }
}

export function placeConfig(root, preset) {
  const content = renderConfig({ preset });
  return placeFile({
    root,
    relative: CONFIG_FILE_NAME,
    content,
    isEquivalent: (text) => {
      const parsed = parsedPreset(text);
      return parsed.kind === 'parsed' && parsed.preset === preset;
    },
  });
}
