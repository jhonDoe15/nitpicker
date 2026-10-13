import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';
import { renderWithProviders } from '../support/test-utils';

it('reads the first child of the rendered container', () => {
  const { container } = renderWithProviders(<Counter items={[]} />);

  expect(container.firstChild).not.toBeNull();
});
