import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Counter } from '../src/main/ui/allowed';

it('queries by test id from a repo-root e2e folder', () => {
  render(<Counter items={[]} />);

  expect(screen.getByTestId('list')).toBeDefined();
});
