import { JAVASCRIPT_EXTENSIONS } from './javascript-preset.mjs';

const SELECTION_MODULE = /@barney-media\/crap-typescript-core\/dist\/fileSelection\.js$/;
const TYPESCRIPT_ONLY_EXTENSIONS = 'const ANALYZABLE_EXTENSIONS = [".ts", ".tsx"];';
const WITH_JAVASCRIPT_EXTENSIONS = `const ANALYZABLE_EXTENSIONS = [".ts", ".tsx", ${JAVASCRIPT_EXTENSIONS.map((extension) => `".${extension}"`).join(', ')}];`;

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!SELECTION_MODULE.test(url)) {
    return loaded;
  }
  const source = String(loaded.source);
  if (!source.includes(TYPESCRIPT_ONLY_EXTENSIONS)) {
    throw new Error(
      'The CRAP library no longer lists its analyzable extensions the way the JavaScript preset expects; update languages/javascript/preset/crap-extensions-hook.mjs.',
    );
  }
  return {
    ...loaded,
    source: source.replace(TYPESCRIPT_ONLY_EXTENSIONS, WITH_JAVASCRIPT_EXTENSIONS),
  };
}
