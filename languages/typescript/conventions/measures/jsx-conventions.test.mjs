import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { JSX_CONVENTIONS } from './jsx-conventions.mjs';
import { prettierConventionOptions } from '../prettier-conventions.mjs';

const measures = Object.fromEntries(JSX_CONVENTIONS.map(({ id, measure }) => [id, measure]));
const source = `export function Card({ item, onSelect }) {
  return (
    <section className="card" data-kind="primary">
      <Button type="button" variant="outline" disabled={item.locked} onClick={() => onSelect(item.id)}>
        Select this item from the list of cards
      </Button>
      <img src={item.image} alt="Preview of the selected item" width="320" height="240" loading="lazy" />
      <Link to="/items" title="All items" className="card-link" activeClassName="card-link-active">
        Back
      </Link>
    </section>
  );
}
`;

const formatted = (options) =>
  prettier.format(source, { parser: 'babel', singleQuote: true, printWidth: 80, ...options });

describe('JSX conventions', () => {
  for (const convention of JSX_CONVENTIONS) {
    for (const option of convention.options) {
      it(`reads ${convention.id} = ${option} from code Prettier formatted that way`, async () => {
        const text = await formatted(prettierConventionOptions({ [convention.id]: option }));

        expect(convention.measure(text)).toBe(option);
      });
    }
  }

  it('maps the choices to Prettier options', () => {
    expect(
      prettierConventionOptions({
        'prettier.jsxQuotes': 'single',
        'prettier.bracketSameLine': 'sameLine',
      }),
    ).toEqual({ jsxSingleQuote: true, bracketSameLine: true });
  });

  it.each([
    [
      'prettier.jsxQuotes',
      '<a href="x" rel="y">y</a>;\n<b title="it\'s" id=\'z\'>y</b>;\n',
      'double',
    ],
    ['prettier.jsxQuotes', '<a title={"x"} data-a=\'q"r\'>y</a>;\n', undefined],
    ['prettier.jsxQuotes', 'const a = "x";\nconst b = { c: "d" };\nf(a = "z");\n', undefined],
    ['prettier.jsxQuotes', '// <a href="x">\n/* b="c" */\nconst a = 1;\n', undefined],
    ['prettier.jsxQuotes', "<a href='x' id='y'>z</a>;\n", 'single'],
    ['prettier.jsxQuotes', '<a href="x" id=\'y\'>z</a>;\n', undefined],
    ['prettier.bracketSameLine', '<A\n  b="1"\n  c="2"\n/>;\n', undefined],
    ['prettier.bracketSameLine', '<A\n  b="1"\n  c={2}\n>\n  x\n</A>;\n', 'newLine'],
    ['prettier.bracketSameLine', '<A\n  b="1"\n  c={2}>\n  x\n</A>;\n', 'sameLine'],
    ['prettier.bracketSameLine', '<A\n  {...props}>\n  x\n</A>;\n', 'sameLine'],
    [
      'prettier.bracketSameLine',
      'type T = Map<\n  string,\n  number\n>;\nconst a = b > c;\n',
      undefined,
    ],
    ['prettier.bracketSameLine', 'f(\n  a=1,\n  b,\n);\nx = y =>\n  y;\n', undefined],
    ['prettier.bracketSameLine', '<A\n  b="1"\n  onClick={() => run()}>\n  x\n</A>;\n', 'sameLine'],
  ])('%s on %j', (id, text, expected) => {
    expect(measures[id](text)).toBe(expected);
  });
});
