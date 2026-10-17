import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'mocha';
import { main } from '../src/main/composition-root.js';

describe('main', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the greeting into the page', () => {
    main();
    assert.equal(document.body.innerHTML, '<p>Hello, Ada!</p>');
  });
});
