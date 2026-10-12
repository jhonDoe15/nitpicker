import { useEffect } from 'react';

export function Loader({ id }: { readonly id: string }) {
  useEffect(() => {
    void fetch(`/items/${id}`);
  }, [id]);
  return <div className="loader" />;
}
