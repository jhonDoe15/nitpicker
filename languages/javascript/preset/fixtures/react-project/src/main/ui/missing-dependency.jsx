import { useEffect } from 'react';

export function Panel({ title }) {
  useEffect(() => {
    document.title = title;
  }, []);
  return <div className="panel" />;
}
