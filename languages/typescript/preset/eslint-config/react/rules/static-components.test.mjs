import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../../layout.mjs';
import { reactSyntaxConfigFor } from '../react-scope.mjs';

const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await reactSyntaxConfigFor(defaultResolvedLayout)),
];

function ruleIdsFor(body) {
  const code = `import { withTheme } from 'theme';\nexport function Panel() { ${body} }`;
  return lintFixture({ config, filename: 'src/main/ui/panel.tsx', code }).map(
    ({ ruleId }) => ruleId,
  );
}

describe('components created during render', () => {
  it.each([
    ['a function declaration', 'function Inner() { return <i />; } return <Inner />;'],
    ['an arrow function', 'const Inner = () => <i />; return <Inner />;'],
  ])('report %s once, as a nested definition', (_name, body) => {
    expect(ruleIdsFor(body)).toEqual(['react-x/no-nested-component-definitions']);
  });

  it('report a component built by a call once, at its use', () => {
    expect(ruleIdsFor('const Themed = withTheme(Card); return <Themed />;')).toEqual([
      'react-x/static-components',
    ]);
  });

  it('leave a module-level component alone', () => {
    expect(ruleIdsFor('return <Card />;')).toEqual([]);
  });
});
