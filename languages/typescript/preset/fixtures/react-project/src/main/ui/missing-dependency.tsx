import { useEffect } from 'react';

export function Panel({ title }: { readonly title: string }) {
  useEffect(() => {
    document.title = title;
  }, []);
  return <div className="panel" />;
}
