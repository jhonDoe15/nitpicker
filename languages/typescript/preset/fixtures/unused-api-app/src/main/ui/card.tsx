import { memo } from 'react';

type SectionProps = { title: string; subtitle?: string };
type CardProps = SectionProps & { footer?: string };

export const Card = memo(function Card({ title, footer }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <footer>{footer}</footer>
    </section>
  );
});
