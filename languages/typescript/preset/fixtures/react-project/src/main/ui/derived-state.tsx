import { useEffect, useState } from 'react';

export function Name({ first, last }: { readonly first: string; readonly last: string }) {
  const [full, setFull] = useState('');
  useEffect(() => {
    setFull(`${first} ${last}`);
  }, [first, last]);
  return <p className="name">{full}</p>;
}
