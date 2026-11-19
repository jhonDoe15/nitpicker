import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Greeting } from './features/greeting/index';

export function main(container: HTMLElement): void {
  createRoot(container).render(createElement(Greeting, { name: 'Ada' }));
}
