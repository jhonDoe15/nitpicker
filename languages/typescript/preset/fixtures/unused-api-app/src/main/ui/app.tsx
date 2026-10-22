import { lazy } from 'react';
import { Button } from './button';
import { Card } from './card';
import { Field } from './field';
import { formatLabel } from './format';
import { Home } from './pages';
import { useFetch } from './use-fetch';

export const routes = [{ path: '/', component: Home }];
export const Settings = lazy(() =>
  import('./pages').then((module) => ({ default: module.Settings })),
);

export function App() {
  const request = useFetch('/api', { retries: 2 });
  return (
    <main>
      <Button label={formatLabel(request.url)} tone="quiet" />
      <Card title="Summary" footer="done" />
      <Field name="query" hint="Search" />
    </main>
  );
}
