import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('counts clicks on the button by its role', async () => {
  render(<Counter items={[{ id: 'a', label: 'Add' }]} />);

  await userEvent.click(screen.getByRole('button', { name: 'Add' }));

  expect(screen.getByRole('list')).toBeDefined();
});
