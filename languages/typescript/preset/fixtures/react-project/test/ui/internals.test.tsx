import { mount } from 'enzyme';
import { expect, it } from 'vitest';
import { Counter } from '../../src/main/ui/allowed';

it('reads the component state', () => {
  expect(mount(<Counter items={[]} />).state()).toEqual({ count: 0 });
});
