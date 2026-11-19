import type { KotlinDeclarations } from '../typed/rule-shapes.mts';
import type { Literal, Scanned } from '../typed/scan-shapes.mts';

export type SqlPiece = { text: string } | { expression: string } | { runtime: true };

export type ClassifiedPiece = { text: string } | { runtime: true };

export type TemplateState = {
  text: string;
  raw: boolean;
  pieces: SqlPiece[];
  cursor: number;
  open: number;
  depth: number;
};

export type DeclaredNames = { typed: string[]; assigned: RegExpExecArray[] };

export type InertContext = { declarations: KotlinDeclarations };

export type MemberContext = InertContext & { scanned: Scanned };

export type Operand = { literal: Literal } | { expression: string };

export type Segment = { end: number; next?: number };

export type Candidate = { start: number; end: number; pieces: SqlPiece[] };
