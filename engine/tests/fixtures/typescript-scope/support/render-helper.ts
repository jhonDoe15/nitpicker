import { render, screen } from '@testing-library/react';

export function renderPage(markup: string) {
  return render(markup);
}

export { screen };
