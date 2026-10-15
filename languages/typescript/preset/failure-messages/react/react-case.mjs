import tseslint from 'typescript-eslint';
import { reactSyntaxConfigFor } from '../../eslint-config/react-scope.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';

const config = [
  { languageOptions: { parser: tseslint.parser } },
  ...(await reactSyntaxConfigFor(defaultResolvedLayout)),
];

export function reactCase([name, banned, allowed]) {
  return { name: `react: ${name}`, config, filename: 'src/main/ui/fixture.tsx', banned, allowed };
}

export function panel(body) {
  return `export function Panel({ items, a }) { ${body} return <div />; }`;
}

export function exceptionCase([name, banned]) {
  return [`${name} names the config exception`, banned, 'nitpicker.config.json'];
}
