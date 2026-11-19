import { useEffect, useState } from 'react';

export function Name({ first, last }) {
  const [full, setFull] = useState('');
  useEffect(() => {
    setFull(`${first} ${last}`);
  }, [first, last]);
  return <p className="name">{full}</p>;
}
