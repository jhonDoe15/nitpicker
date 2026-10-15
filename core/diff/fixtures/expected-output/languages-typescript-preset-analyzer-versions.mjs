import { expect } from 'vitest';
export function expectedOutput21_23({ plugin }) {
  return `eslint@1.0.0;typescript@1.0.0;plugins:${`${plugin}@1.0.0`},@vitest/eslint-plugin@1.0.0,eslint-plugin-functional@1.0.0,eslint-plugin-jsx-a11y-x@1.0.0,eslint-plugin-react-hooks@1.0.0,eslint-plugin-react-x@1.0.0,eslint-plugin-testing-library@1.0.0,typescript-eslint@1.0.0,nitpicker-plugin@0.1.0-rc.1`;
}
