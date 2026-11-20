import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('shows the tooltip', async () => {
  render(<button title="Save">Save</button>);
  fireEvent.mouseEnter(screen.getByRole('button'));
  await userEvent.hover(screen.getByRole('button'));
  await userEvent.pointer([{ target: screen.getByRole('button') }]);
  await userEvent.type(screen.getByRole('button'), 'plain text');
});
