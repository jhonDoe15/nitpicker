import { render, screen, waitFor } from '@testing-library/react';

function labelled(name: string, findByText: unknown) {
  function findByText() {
    return screen.findByText(name);
  }
  findByText();
  return screen.findByText(name);
}

function waited(waitFor: unknown) {
  function waitFor() {
    return 1;
  }
  return waitFor();
}

test('a function declaration that redeclares a parameter', async () => {
  render(<form />);
  labelled('Name', undefined);
  waited(undefined);
  screen.findByText('Saved');
  waitFor(() => screen.getByText('Saved'));
});
