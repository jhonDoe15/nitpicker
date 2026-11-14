import { render, screen } from '@testing-library/react';
import { Greeting } from '../index';

describe('Greeting', () => {
  it('greets a trimmed name', () => {
    render(<Greeting name="  Ada " />);
    expect(screen.getByRole('paragraph').textContent).toBe('Hello, Ada!');
  });

  it('says when the name is empty', () => {
    render(<Greeting name="   " />);
    expect(screen.getByRole('paragraph').textContent).toBe('No name given');
  });
});
