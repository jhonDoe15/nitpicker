import { useEffect } from 'react';
import type { ReactElement } from 'react';

export function Loader({ id }: { readonly id: string }): ReactElement {
  useEffect(() => {
    void fetch(`/items/${id}`);
  }, [id]);
  return <div className="loader" />;
}
