import type { ReactElement } from 'react';

export function Logo({ open }: { readonly open: () => void }): ReactElement {
  return <img src="/logo.png" onClick={open} />;
}
