import { act, screen } from '@testing-library/react';
import { main } from '../src/main/composition-root';

it('renders the greeting into the container', () => {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    main(container);
  });
  expect(screen.getByRole('paragraph').textContent).toBe('Hello, Ada!');
  container.remove();
});
