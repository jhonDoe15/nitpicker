import { beforeAll, describe, expect, it } from 'vitest';
import type { ShapeNode, Unit } from '../jvm-types.mts';
import { findNearDuplicates } from '../test-support/engine-views.mts';
import { javaParser, type JvmParser } from '../test-support/parse-jvm.mts';
import { shapeNodesOf } from '../test-support/shape-views.mts';
import { present } from './nodes.mts';

const parsers: JvmParser[] = [];

beforeAll(async () => {
  parsers.push(await javaParser());
});

function methodWith(parameter: string, name = 'buildUrl'): string {
  return `
  String ${name}(String path, ${parameter}) {
    StringBuilder url = new StringBuilder(path.length() + 16);
    url.append(path.startsWith("/") ? path : "/" + path);
    for (Object param : params) {
      url.append(url.indexOf("?") < 0 ? "?" : "&").append(String.valueOf(param).trim());
    }
    return url.toString();
  }`;
}

function unitsOf(...methods: string[]): Unit[] {
  return present(parsers[0])(`class Urls {${methods.join('\n')}\n}\n`, 'Urls.java');
}

function parametersOf(parameter: string): readonly ShapeNode[] {
  return present(present(unitsOf(methodWith(parameter))[0]).tree.children[1]).children;
}

function typesOf(parameter: string): (string | undefined)[] {
  return parametersOf(parameter).map(({ children: [type] }) => type?.value);
}

function bindingsOf(parameter: string): (string | undefined)[] {
  const [unit] = unitsOf(methodWith(parameter));
  return [
    ...new Set(
      shapeNodesOf(present(unit).tree)
        .filter(({ text }) => text === 'params')
        .map(({ binding }) => binding),
    ),
  ];
}

describe('Java varargs parameters with an annotation before the ellipsis', () => {
  it.each([
    'Object @Nullable ... params',
    'Object @Nullable... params',
    'final Object @Nullable @Other ... params',
    '@Nullable Object @org.jspecify.annotations.Nullable ... params',
    'Object @Size(max = 4) ... params',
  ])('reads %s like a plain varargs parameter', (parameter) => {
    expect(parametersOf(parameter)).toEqual(parametersOf('Object... params'));
    expect(bindingsOf(parameter)).toEqual(['bound']);
  });

  it('keeps the type of every other annotated parameter form', () => {
    expect(typesOf('Object @Nullable [] params')).toEqual(['String', 'Object@Nullable[]']);
    expect(typesOf('@Nullable Object... params')).toEqual(['String', 'Object']);
    expect(typesOf('List<String> @Nullable ... params')).toEqual(['String', 'List<String>']);
  });

  it('compares two methods that both take such a parameter', () => {
    const units = unitsOf(
      methodWith('Object @Nullable ... params'),
      methodWith('Object @Nullable ... params', 'buildVersionedUrl'),
    );

    expect(findNearDuplicates(units).map(({ verdict, units: pair }) => [verdict, pair])).toEqual([
      [
        'same',
        [
          'Urls.java#Urls.buildUrl(String,Object)',
          'Urls.java#Urls.buildVersionedUrl(String,Object)',
        ],
      ],
    ]);
  });
});
