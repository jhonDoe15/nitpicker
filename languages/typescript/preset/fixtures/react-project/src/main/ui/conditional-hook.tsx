import { useState } from 'react';
import type { ReactElement } from 'react';

export function Panel({ open }: { readonly open: boolean }): ReactElement {
  if (open) {
    useState(1);
  }
  return <div className="panel" />;
}
