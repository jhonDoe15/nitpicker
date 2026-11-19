import { useEffect, useState } from 'react';

export function Loader({ id }) {
  const [item, setItem] = useState(null);
  useEffect(() => {
    fetch(`/items/${id}`).then((response) => setItem(response));
  }, [id]);
  return <div className="loader">{String(item)}</div>;
}
