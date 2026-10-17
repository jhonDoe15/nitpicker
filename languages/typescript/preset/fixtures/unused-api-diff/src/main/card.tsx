type CardProps = { title: string; footer?: string };

export function Card({ title, footer }: CardProps) {
  return (
    <section>
      {title}
      {footer}
    </section>
  );
}
