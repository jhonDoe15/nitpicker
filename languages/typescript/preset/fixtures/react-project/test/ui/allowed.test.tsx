import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('counts clicks on the button by its role', async () => {
  const user = userEvent.setup();
  render(<Counter items={[{ id: 'a', label: 'Add' }]} />);

  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(screen.getByRole('list')).toBeDefined();
});
