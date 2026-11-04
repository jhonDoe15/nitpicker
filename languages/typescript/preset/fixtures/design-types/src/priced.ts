export interface Priced {
  price(): number;
}

export interface Plain {
  id: string;
  label?: string;
}

export type Shape = { width: number; height: number };

export type Mode = 'fast' | 'slow' | 'off';

export type Level = 1 | 2 | -3;

export type Combined = Mode | 'extra';

export type Mixed = 'a' | number | undefined;

export type Callback = () => void;
