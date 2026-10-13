import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('clicks without waiting for the event', () => {
  render(<Counter items={[{ id: 'a', label: 'Add' }]} />);

  userEvent.click(screen.getByRole('button', { name: 'Add' }));
});
