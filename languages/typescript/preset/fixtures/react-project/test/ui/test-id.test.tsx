import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('finds the list by test id', () => {
  render(<Counter items={[]} />);

  expect(screen.getByTestId('counter')).toBeDefined();
});
