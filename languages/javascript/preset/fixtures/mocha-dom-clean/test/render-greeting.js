import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { renderGreeting } from '../src/main/features/greeting/index.js';

describe('renderGreeting', () => {
  it('renders one paragraph per name, trimmed, and names an empty one', () => {
    const container = document.createElement('div');
    renderGreeting(container, ['  Ada ', '   ']);
    assert.deepEqual(
      [...container.querySelectorAll('p')].map((line) => line.textContent),
      ['Hello, Ada!', 'No name given'],
    );
  });
});
