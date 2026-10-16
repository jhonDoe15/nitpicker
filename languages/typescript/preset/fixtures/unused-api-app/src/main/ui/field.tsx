import { forwardRef } from 'react';

type FieldProps = { name: string; hint?: string; mask?: boolean };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ name, hint }, ref) {
  return <input ref={ref} name={name} title={hint} />;
});
