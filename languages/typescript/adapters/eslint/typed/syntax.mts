import type TypeScript from 'typescript';
import {
  commentAt as untypedCommentAt,
  commentFingerprint as untypedCommentFingerprint,
  enclosingFunctionHash as untypedEnclosingFunctionHash,
  enclosingSymbol as untypedEnclosingSymbol,
  eslintNodeType as untypedEslintNodeType,
  findReportedNode as untypedFindReportedNode,
  findStartedNode as untypedFindStartedNode,
  nodeChain as untypedNodeChain,
  normalizeMessageText as untypedNormalizeMessageText,
  scriptKind as untypedScriptKind,
  stableSyntaxAnchor as untypedStableSyntaxAnchor,
  syntaxFingerprint as untypedSyntaxFingerprint,
} from '../syntax.mjs';

type Node = TypeScript.Node;
type SourceFile = TypeScript.SourceFile;

export const commentAt: (
  text: string,
  position: number,
  endPosition: number | undefined,
) => string | undefined = untypedCommentAt;

export const commentFingerprint: (comment: string) => string = untypedCommentFingerprint;

export const findStartedNode: (sourceFile: SourceFile, position: number) => Node =
  untypedFindStartedNode;

export const findReportedNode: (
  sourceFile: SourceFile,
  position: number,
  endPosition: number | undefined,
) => Node = untypedFindReportedNode;

export const eslintNodeType: (node: Node) => string = untypedEslintNodeType;

export const stableSyntaxAnchor: (node: Node) => Node = untypedStableSyntaxAnchor;

export const nodeChain: (node: Node) => Node[] = untypedNodeChain;

export const enclosingFunctionHash: (node: Node, symbol: string | undefined) => string | undefined =
  untypedEnclosingFunctionHash;

export const enclosingSymbol: (node: Node) => string | undefined = untypedEnclosingSymbol;

export const syntaxFingerprint: (node: Node, nodeType: string) => string = untypedSyntaxFingerprint;

export const normalizeMessageText: (value: string) => string = untypedNormalizeMessageText;

export const scriptKind: (filePath: string) => TypeScript.ScriptKind = untypedScriptKind;
