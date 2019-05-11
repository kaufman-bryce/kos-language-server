import { KsVariable } from '../entities/variable';
import { KsFunction } from '../entities/function';
import { KsLock } from '../entities/lock';
import { IToken } from '../entities/types';
import { KsParameter } from '../entities/parameters';
import { Range, Location } from 'vscode-languageserver';
import { IArgumentType, IFunctionType } from '../typeChecker/types/types';
import { IExpr, ISuffixTerm, IInst } from '../parser/types';

export const enum SymbolState {
  declared,
  used,
}

export const enum LockState {
  locked,
  used,
  unlocked,
}

export interface IFunctionScanResult {
  optionalParameters: number;
  requiredParameters: number;
  return: boolean;
}

export interface ILocalResult {
  token: IToken;
  expr: IExpr | ISuffixTerm;
}

export interface IScope extends Map<string, IKsSymbolTracker> {
  symbols(): KsSymbol[];
}

export interface IKsSymbolTracker<T extends KsSymbol = KsSymbol> {
  declared: IKsDeclared<T>;
  sets: IKsChange[];
  usages: Location[];

  declareType(type: IArgumentType | IFunctionType): void;
  getType(loc: Location): Maybe<IArgumentType | IFunctionType>;
  setType(loc: Location, type: IArgumentType | IFunctionType): void;
}

export interface IScopePath {
  active: IStack<number>;
  backTrack: IStack<number>;
}

export interface IKsChange extends Location {
  type: IArgumentType;
  expr?: IExpr | ISuffixTerm;
}

export interface IKsDeclared<T extends KsSymbol> extends Location {
  symbol: T;
  type: IArgumentType | IFunctionType;
}

export interface IRealScopePosition extends Range {
  tag: 'real';
}

export interface IGlobalScopePosition {
  tag: 'global';
}

type IScopePosition = IRealScopePosition | IGlobalScopePosition;

export interface GraphNode<T> {
  value: T;
  adjacentNodes: GraphNode<T>[];
}

export interface IScopeNode {
  readonly position: IScopePosition;
  readonly scope: IScope;
  readonly children: IScopeNode[];
}

export interface ISetResolverResult {
  readonly set: Maybe<IToken>;
  readonly used: ILocalResult[];
}

export type KsSymbol = KsVariable | KsFunction | KsLock | KsParameter;

export enum KsSymbolKind {
  variable,
  function,
  lock,
  parameter,
  suffix,
}

/**
 * This representing a syntax nod that will be executed later
 */
export interface IDeferred {
  /**
   * Path to scope
   */
  path: IScopePath;

  /**
   * How many loops deep is the current location
   */
  loopDepth: number;

  /**
   * How many functions deep is the current location
   */
  functionDepth: number;

  /**
   * Node to be executed later
   */
  node: IInst | IExpr;
}

// tslint:disable-next-line:prefer-array-literal
export interface IStack<T> extends Pick<Array<T>, 'pop' | 'push' | 'length'> {
  [index: number]: T;
  [Symbol.iterator](): IterableIterator<T>;
}
