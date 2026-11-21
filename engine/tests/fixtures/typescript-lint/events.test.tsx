import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup() {
  return { user: userEvent.setup() };
}

test('events and act', async () => {
  render(<input />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
  fireEvent.scroll(window);
  fireEvent(screen.getByRole('button'), createEvent.keyDown(screen.getByRole('button')));
  const pasted = createEvent.paste(screen.getByRole('textbox'));
  fireEvent(screen.getByRole('textbox'), pasted);

  await userEvent.click(screen.getByRole('button'));
  await userEvent.type(screen.getByRole('textbox'), 'b');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  const { user: other } = setup();
  await other.hover(screen.getByRole('button'));

  act(() => {});
  act(() => {
    fireEvent.click(screen.getByRole('button'));
  });
  await act(async () => {
    await user.click(screen.getByRole('button'));
  });
  act(() => screen.getByRole('button'));
  act(() => {
    store.dispatch({ type: 'tick' });
  });
});
