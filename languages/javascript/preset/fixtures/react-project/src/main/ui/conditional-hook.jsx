import { useState } from 'react';

export function Panel({ open }) {
  if (open) {
    useState(1);
  }
  return <div className="panel" />;
}
