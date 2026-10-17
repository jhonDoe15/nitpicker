import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('pins the rendered list as a snapshot', () => {
  render(<Counter items={[]} />);

  expect(screen.getByRole('list')).toMatchSnapshot();
});
