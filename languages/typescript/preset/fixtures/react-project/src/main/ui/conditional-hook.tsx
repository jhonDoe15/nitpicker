import { useState } from 'react';

export function Panel({ open }: { readonly open: boolean }) {
  if (open) {
    useState(1);
  }
  return <div className="panel" />;
}
