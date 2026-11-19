import type { Reported } from '../../typed/rule-shapes.mts';

export type RawUnitToken = {
  kind: string;
  text: string;
  start: number;
  end: number;
  value?: number | undefined;
  quoted?: true;
};

export type UnitToken = RawUnitToken & {
  inside: string | undefined;
  nesting: number;
  close?: number | undefined;
};

export type UnitValue = {
  epoch?: true | undefined;
  text?: true;
  unit?: string | undefined;
  constant?: number | undefined;
  name?: string;
  from?: number | undefined;
  to?: number | undefined;
  timeUnit?: string | undefined;
};

export type UnitArgument = { name: string | undefined; value: UnitValue };

type Region = UnitValue | UnitArgument[];

export type UnitBase = {
  code: string;
  tokens: UnitToken[];
  values: Map<string, number>;
  functions: Map<string, string[]>;
  imports: Set<string | undefined>;
  reports: Map<string, Reported>;
};

export type Levels = {
  regions: Map<number, Region>;
  declared: Map<string, UnitValue>;
  values: Map<string, UnitValue>;
};

export type UnitFile = UnitBase & { levels: Levels };

export type Parser = {
  file: UnitBase;
  tokens: UnitToken[];
  position: number;
  depth: number;
  regions: Map<number, Region>;
  declared: Map<string, UnitValue>;
};

export type Selector = {
  receiver: UnitValue;
  name: string;
  nameIndex: number;
  args: UnitArgument[] | undefined;
  from: number;
};

export type CallInfo = {
  name: string;
  nameIndex: number;
  args: UnitArgument[];
  receiver: UnitValue;
  unit?: string | undefined;
};
