type PageProps = { heading?: string; compact?: boolean };

export function Home({ heading }: PageProps) {
  return <h1>{heading}</h1>;
}

export function Settings({ heading }: PageProps) {
  return <h1>{heading}</h1>;
}
