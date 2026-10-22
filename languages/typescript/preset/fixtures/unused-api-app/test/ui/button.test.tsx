import { expect, it } from 'vitest';
import { Button } from '../../src/main/ui/button';
import { formatForTests } from '../../src/main/ui/format';

it('renders a sized button', () => {
  expect(<Button label={formatForTests('a')} size={2} />).toBeDefined();
});
