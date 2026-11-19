import { fireEvent, render, screen } from '@testing-library/react';
import { it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed.jsx';

it('clicks with fireEvent', () => {
  render(<Counter items={[{ id: 'a', label: 'Add' }]} />);

  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
});
