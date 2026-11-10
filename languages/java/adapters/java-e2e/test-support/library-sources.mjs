import { libraryClass } from '../../metrics/test-support/library-classes.mjs';

function sourceOf(name, dependencies) {
  const cut = name.lastIndexOf('.');
  const terms = dependencies.map((dependency) => `new ${dependency}().value()`);
  const body = terms.length === 0 ? '1' : terms.join('\n        + ');
  return `package ${name.slice(0, cut)};

public final class ${name.slice(cut + 1)} {
  public int value() {
    return ${body};
  }
}
`;
}

export function librarySources(uses) {
  const classes = [...new Set(uses.flat().map(libraryClass))];
  return Object.fromEntries(
    classes.map((name) => [
      `src/main/java/${name.replaceAll('.', '/')}.java`,
      sourceOf(
        name,
        uses
          .filter(([source]) => libraryClass(source) === name)
          .map(([, target]) => libraryClass(target)),
      ),
    ]),
  );
}
