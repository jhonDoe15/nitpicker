import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'primary' | 'quiet';
  size?: number;
  loading?: boolean;
};

export function Button({ label, tone = 'primary', size = 1, ...rest }: ButtonProps) {
  return (
    <button data-tone={tone} data-size={size} {...rest}>
      {label}
    </button>
  );
}
