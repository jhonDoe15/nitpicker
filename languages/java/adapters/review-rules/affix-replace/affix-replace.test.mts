import { describe, expect, it } from 'vitest';
import { sourceRunners } from '../test-support/source-runners.mts';
import { findAffixReplaces as untypedFind } from './affix-replace.mjs';

const find: (source: unknown) => { readonly kind: string }[] = untypedFind;

const { java, kotlin } = sourceRunners({
  find,
  pick: ({ kind }) => kind,
  java: {
    file: 'Names.java',
    wrap: (body) =>
      `class Names {\n  void use(String name, String suffix, String root, String path) {\n${body}\n  }\n}\n`,
  },
  kotlin: {
    file: 'Names.kt',
    wrap: (body) =>
      `class Names {\n  fun use(name: String, suffix: String, root: ` +
      `String, path: String) {\n${body}\n  }\n}\n`,
  },
});

describe('AffixRemovedByReplace', () => {
  it('reports a suffix or prefix removed by replace in Java', () => {
    expect(java('String repo = name.replace(".git", "");')).toEqual(['suffix']);
    expect(java('String rel = path.replace(root, "");')).toEqual(['prefix']);
    expect(java('String rel = path.replace(root, "~");')).toEqual(['prefix']);
    expect(java('String rel = request.getPath().replace(root, "");')).toEqual(['prefix']);
  });

  it('reports the same forms in Kotlin', () => {
    expect(kotlin('val repo = name.replace(".git", "")')).toEqual(['suffix']);
    expect(kotlin('val rel = path.replace(root, "")')).toEqual(['prefix']);
  });

  it('leaves anchored removals and other replacements alone', () => {
    expect(java('String base = name.substring(0, name.length() - suffix.length());')).toEqual([]);
    expect(java('String x = name.replace(".git", ".zip");')).toEqual([]);
    expect(java('String x = name.replace(".", "");')).toEqual([]);
    expect(java('String x = name.replace("foo", "");')).toEqual([]);
    expect(java('String x = name.replaceAll("\\\\.git$", "");')).toEqual([]);
    expect(java('String x = name.replace(root, path);')).toEqual([]);
    expect(java('String x = other.replace(root, "");')).toEqual([]);
    expect(kotlin('val x = name.removeSuffix(".git")')).toEqual([]);
  });

  it('leaves a replace that follows its own endsWith or startsWith check', () => {
    expect(java('String base = name.endsWith(suffix) ? name.replace(suffix, "") : name;')).toEqual(
      [],
    );
    expect(java('if (path.startsWith(root)) { return path.replace(root, ""); }')).toEqual([]);
    expect(java('if (name.endsWith(".git")) name = name.replace(".git", "");')).toEqual([]);
    expect(
      java('files.filter(f -> f.endsWith(".json")).map(f -> f.replace(".json", ""));'),
    ).toEqual([]);
    expect(java('if (ready) { return path.replace(root, ""); }')).toEqual(['prefix']);
  });
});
