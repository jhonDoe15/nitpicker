import { fireEvent, render, screen } from '@testing-library/react';
import { it } from 'vitest';
import { Counter } from '../src/main/ui/allowed';

it('fires a raw event from a repo-root __tests__ folder', () => {
  render(<Counter items={[{ id: 'a', label: 'Add' }]} />);

  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
});
