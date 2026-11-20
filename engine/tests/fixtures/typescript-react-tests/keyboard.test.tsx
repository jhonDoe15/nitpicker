import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('shows the tooltip from the keyboard too', async () => {
  render(<button title="Save">Save</button>);
  await userEvent.hover(screen.getByRole('button'));
  await userEvent.type(screen.getByRole('button'), `{Enter}`);
});
