import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('finds the list by class selector', () => {
  const { container } = render(<Counter items={[]} />);

  expect(container.querySelector('.counter')).not.toBeNull();
});
