import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const findSave = () => screen.findByRole('button', { name: 'Save' });
function waitForSaved() {
  return waitFor(() => screen.getByText('Saved'));
}
const setupUser = () => {
  const user = userEvent.setup();
  return { user };
};

test('unhandled promises', async () => {
  render(<form />);
  screen.findByText('Name');
  const pending = screen.findByLabelText('Name');
  expect(pending).toBeDefined();
  findSave();
  waitFor(() => screen.getByText('Saved'));
  waitForSaved();
  waitForElementToBeRemoved(screen.queryByText('Loading'));
  userEvent.click(screen.getByText('Save'));
  const { user } = setupUser();
  user.type(screen.getByLabelText('Name'), 'a');
  const direct = userEvent.setup();
  direct.keyboard('b');
});

test('handled promises', async () => {
  render(<form />);
  await screen.findByText('Name');
  const pending = screen.findByLabelText('Name');
  await pending;
  await expect(screen.findByText('Saved')).resolves.toBeDefined();
  await Promise.all([screen.findByText('a'), screen.findByText('b')]);
  screen.findByText('c').then(() => undefined);
  await findSave();
  await waitFor(() => screen.getByText('Saved'));
  await waitForSaved();
  const user = userEvent.setup();
  await user.click(screen.getByText('Save'));
  return screen.findByText('done');
});
