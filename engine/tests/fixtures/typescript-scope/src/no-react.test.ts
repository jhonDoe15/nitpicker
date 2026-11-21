import data from '../support/data.json';
import { value } from 'support/plain';
import { screen } from './missing';

test('reads the title', () => {
  screen.debug();
  expect(data.title).toBe(String(value));
});
