import { useEffect } from 'react';
import type { ReactElement } from 'react';

export function Panel({ title }: { readonly title: string }): ReactElement {
  useEffect(() => {
    document.title = title;
  }, []);
  return <div className="panel" />;
}
