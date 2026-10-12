export function Logo({ open }: { readonly open: () => void }) {
  return <img src="/logo.png" onClick={open} />;
}
