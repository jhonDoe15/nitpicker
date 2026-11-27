import { setTimeout as pause } from 'node:timers/promises';
import { render, screen } from '@testing-library/react';

const delay = 250;

it('waits', async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await new Promise((resolve) => { setTimeout(() => resolve(), 100); });
  await pause(50);
  await sleep(10);
  await page.waitForTimeout(500);
  cy.wait(delay * 2);
  cy.wait('@request');
  cy.wait(0);
  await expect(screen.findByText('tooltip')).rejects.toThrow();
  const view = render(<Tooltip />);
  await expect(view.findByRole('tooltip')).rejects.toThrow();
  await expect(vi.waitFor(() => check())).rejects.toThrow();
  await expect(other.waitFor(() => check())).rejects.toThrow();
});
