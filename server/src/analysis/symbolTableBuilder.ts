import { empty } from '../utilities/typeGuards';
import { ScopeType, IExpr, ISuffixTerm } from '../parser/types';
import { KsVariable } from '../entities/variable';
import { SymbolState, IScope, IScopeNode,
  KsSymbol, IStack, IKsSymbolTracker, KsSymbolKind,
} from './types';
import { KsFunction } from '../entities/function';
import { KsLock } from '../entities/lock';
import {
  Range, Diagnostic,
  DiagnosticSeverity, DiagnosticRelatedInformation,
} from 'vscode-languageserver';
import { IToken } from '../entities/types';
import { KsParameter } from '../entities/parameters';
import { ScopePosition } from './scopePosition';
import { mockLogger } from '../utilities/logger';
import { Scope } from './scope';
import { KsSymbolTracker, createEnitityChange } from './tracker';
import { IArgumentType, IFunctionType } from '../typeChecker/types/types';
import { SymbolTable } from './symbolTable';
import { isKsVariable, isKsParameter, isKsLock } from '../entities/entityHelpers';
import { rangeToString } from '../utilities/positionHelpers';
import { createDiagnostic } from '../utilities/diagnosticsUtilities';

/**
 * The Symbol table builder is used to declare new symbols and track new symbols
 * in the kerboscript program
 */
export class SymbolTableBuilder {

  /**
   * The global scope for this file
   */
  private readonly global: IScope;

  /**
   * The root scope include the global scope and it's children
   */
  private readonly rootScope: IScopeNode;

  /**
   * The active path in the scope
   */
  private activeScopePath: IStack<number>;

  /**
   * A secondary scope used to indicate where new scopes should go
   */
  private backTrackPath: IStack<number>;

  /**
   * A set of child symbols tables relative to this symbols table builder
   */
  public childSymbolTables: Set<SymbolTable>;

  /**
   * logger class to reporting errors and infomation
   */
  public logger: ILogger;

  /**
   * construct a symbol table builder
   * @param uri the file uri
   * @param logger a logger object
   */
  constructor(public readonly uri: string, logger: ILogger = mockLogger) {
    this.logger = logger;
    this.global = new Scope();
    this.rootScope = {
      scope: this.global,
      children: [],
      position: { tag: 'global' },
    };
    this.activeScopePath = [];
    this.backTrackPath = [];
    this.childSymbolTables = new Set();
  }

  /**
   * Generate a symbol table
   */
  public build(): SymbolTable {
    return new SymbolTable(
      this.rootScope,
      this.childSymbolTables,
      this.uri,
      this.logger,
    );
  }

  /**
   * Rewind the current scope path for a second pass
   */
  public rewindScope(): void {
    this.activeScopePath = [];
    this.backTrackPath = [];
  }

  /**
   * Add a child symbol table to this symbol table builder
   * @param symbolTable the child symbol table
   */
  public addScope(symbolTable: SymbolTable): void {
    this.childSymbolTables.add(symbolTable);
  }

  /**
   * Push a new scope onto the scope stack
   * @param range the range of the new scope
   */
  public beginScope(range: Range): void {
    const depth = this.activeScopePath.length - 1;
    const next = !empty(this.backTrackPath[depth + 1])
      ? this.backTrackPath[depth + 1] + 1 : 0;

    const activeNode = this.activeScopeNode();

    if (empty(activeNode.children[next])) {
      activeNode.children.push({
        scope: new Scope(),
        position: new ScopePosition(range.start, range.end),
        children: [],
      });
    }

    this.logger.verbose(`begin scope at ${JSON.stringify(range.start)}`);

    this.activeScopePath.push(next);
    this.backTrackPath = [...this.activeScopePath];
  }

  /**
   * Pop the current scope off the stack
   */
  public endScope(): Diagnostic[] {
    const { scope, position } = this.activeScopeNode();
    this.activeScopePath.pop();

    const errors = [];
    if (!empty(scope)) {
      for (const tracker of scope.values()) {
        switch (tracker.declared.symbol.tag) {
          case KsSymbolKind.function:
            break;
          case KsSymbolKind.parameter:
            if (tracker.usages.length === 0) {
              errors.push(createDiagnostic(
                tracker.declared.symbol.name,
                `Parameter ${tracker.declared.symbol.name.lexeme} was not used.`,
                DiagnosticSeverity.Error));
            }
            break;
          case KsSymbolKind.lock:
            if (!tracker.declared.symbol.cooked && tracker.usages.length === 0) {
              errors.push(createDiagnostic(
                tracker.declared.symbol.name,
                `Lock ${tracker.declared.symbol.name.lexeme} was not used.`,
                DiagnosticSeverity.Error));
            }
            break;
          case KsSymbolKind.variable:
            if (tracker.usages.length === 0) {
              errors.push(createDiagnostic(
                tracker.declared.symbol.name,
                `Variable ${tracker.declared.symbol.name.lexeme} was not used.`,
                DiagnosticSeverity.Error));
            }
            break;
          default:
            throw new Error();
        }
      }
    }

    if (position.tag === 'real') {
      this.logger.verbose(`end scope at ${JSON.stringify(position.end)}`);
    }
    return errors;
  }

  /**
   * Indicate if the current scope if file scope
   */
  public isFileScope(): boolean {
    return this.scopeDepth() === 2;
  }

  /**
   * Indicate if the current scope if global scope
   */
  public isGlobalScope(): boolean {
    return this.activeScopeNode() === this.rootScope;
  }

  /**
   * Returns the current scope depth
   */
  public scopeDepth(): number {
    return this.activeScopeStack().length;
  }

  /**
   * Use a symbol in the symbol table
   * @param name token for the current symbol
   * @param expr the expresion the symbol was used in
   */
  public useSymbol(name: IToken, expr: IExpr | ISuffixTerm): Maybe<Diagnostic> {
    const tracker = this.lookup(name, ScopeType.global);

    // check if symbols exists
    if (empty(tracker)) {
      return createDiagnostic(
        name, `Symbol ${name.lexeme} may not exist`, DiagnosticSeverity.Error);
    }

    return this.checkUseSymbol(name, tracker, tracker.declared.symbol.tag, expr);
  }

  /**
   * Use a variable symbol
   * @param name token for the current variable
   * @param expr the expression the symbol was used in
   */
  public useVariable(name: IToken, expr?: IExpr): Maybe<Diagnostic> {
    const variable = this.lookupVariableTracker(name, ScopeType.global);

    return this.checkUseSymbol(name, variable, KsSymbolKind.variable, expr);
  }

  /**
   * Use a function symbol
   * @param name token for the current function
   * @param expr the expression the symbol was used in
   */
  public useFunction(name: IToken, expr?: IExpr): Maybe<Diagnostic> {
    const func = this.lookupFunctionTracker(name, ScopeType.global);

    return this.checkUseSymbol(name, func, KsSymbolKind.function, expr);
  }

  /**
   * Use a lock symbol
   * @param name token for the current lock
   * @param expr the expression the symbol was used in
   */
  public useLock(name: IToken, expr?: IExpr):
    Maybe<Diagnostic> {
    const lock = this.lookupLockTracker(name, ScopeType.global);

    return this.checkUseSymbol(name, lock, KsSymbolKind.lock, expr);
  }

  /**
   * Use a parameter symbol
   * @param name token for the current parameter
   * @param expr the expression the symbol was used in
   */
  public useParameter(name: IToken, expr: IExpr): Maybe<Diagnostic> {
    const parameter = this.lookupParameterTracker(name, ScopeType.global);

    return this.checkUseSymbol(name, parameter, KsSymbolKind.parameter, expr);
  }

  /**
   * Set a variable symbol
   * @param token token for the variable to set
   */
  public setVariable(token: IToken): Maybe<Diagnostic> {
    const tracker = this.lookup(token, ScopeType.global);

    // check if variable has already been defined
    if (empty(tracker)) {
      return createDiagnostic(token, `${token.lexeme} may not exist`, DiagnosticSeverity.Error);
    }

    token.tracker = tracker;
    this.logger.verbose(`set variable ${token.lexeme} at ${rangeToString(token)}`);
    return undefined;
  }

  /**
   * Add a new variable symbol to the table
   * @param scopeType the requested scope type
   * @param token token for the requested variable
   * @param type type to declare variable as
   */
  public declareVariable(scopeType: ScopeType, token: IToken, type?: IArgumentType):
    Maybe<Diagnostic> {
    const conflictTracker = this.lookup(token, scopeType);

    // check if variable has already been defined
    if (!empty(conflictTracker)) {
      return this.localConflictError(token, conflictTracker.declared.symbol);
    }

    let diagnostic: Maybe<Diagnostic>;

    // if global we can't shadow
    if (scopeType === ScopeType.global) {
      diagnostic = undefined;

    // if local check for shadowing hints
    } else {
      const shadowTracker = this.lookup(token, ScopeType.global);
      diagnostic = empty(shadowTracker)
        ? undefined
        : this.shadowSymbolHint(token, shadowTracker.declared.symbol);
    }

    const scope = this.selectScope(scopeType);
    const tracker = new KsSymbolTracker(new KsVariable(scopeType, token), type);

    token.tracker = tracker;
    scope.set(token.lexeme, tracker);

    this.logger.verbose(`declare variable ${token.lexeme} at ${rangeToString(token)}`);

    return diagnostic;
  }

  /**
   * Add a new function symbol to the table
   * @param scopeType the requested scope type
   * @param token token for the requested function
   * @param parameters parameters for the function
   * @param returnValue does the function have a return type
   * @param type type to declare function as
   */
  public declareFunction(
    scopeType: ScopeType,
    token: IToken,
    parameters: KsParameter[],
    returnValue: boolean,
    type?: IFunctionType): Maybe<Diagnostic> {
    const conflictTracker = this.lookup(token, scopeType);

    // check if variable has already been defined
    if (!empty(conflictTracker)) {
      return this.localConflictError(token, conflictTracker.declared.symbol);
    }

    let diagnostic: Maybe<Diagnostic>;

    // if global we can't shadow
    if (scopeType === ScopeType.global) {
      diagnostic = undefined;
      
    // if local check for shadowing hints
    } else {
      const shadowTracker = this.lookup(token, ScopeType.global);
      diagnostic = empty(shadowTracker)
        ? undefined
        : this.shadowSymbolHint(token, shadowTracker.declared.symbol);
    }

    const scope = this.selectScope(scopeType);
    const tracker = new KsSymbolTracker(
      new KsFunction(
        scopeType, token,
        parameters, returnValue),
      type);

    token.tracker = tracker;
    scope.set(token.lexeme, tracker);

    this.logger.verbose(`declare function ${token.lexeme} at ${rangeToString(token)}`);

    return diagnostic;
  }

  /**
   * Add a new lock symbol to the table
   * @param scopeType the requested scope type
   * @param token token for the requested lock
   * @param type type to declare lock as
   */
  public declareLock(
    scopeType: ScopeType,
    token: IToken,
    type?: IArgumentType): Maybe<Diagnostic> {
    const conflictTracker = this.lookup(token, scopeType);

    // check if variable has already been defined
    if (!empty(conflictTracker)) {
      return this.localConflictError(token, conflictTracker.declared.symbol);
    }

    let diagnostic: Maybe<Diagnostic>;

    // if global we can't shadow
    if (scopeType === ScopeType.global) {
      diagnostic = undefined;
      
    // if local check for shadowing hints
    } else {
      const shadowTracker = this.lookup(token, ScopeType.global);
      diagnostic = empty(shadowTracker)
        ? undefined
        : this.shadowSymbolHint(token, shadowTracker.declared.symbol);
    }

    const scope = this.selectScope(scopeType);
    const tracker = new KsSymbolTracker(new KsLock(scopeType, token), type);

    token.tracker = tracker;
    scope.set(token.lexeme, tracker);

    this.logger.verbose(`declare lock ${token.lexeme} at ${rangeToString(token)}`);

    return diagnostic;
  }

  /**
   * Add a new parameter symbol to the table
   * @param scopeType the requested scope type
   * @param token token for the requested parameter
   * @param defaulted is the parameter defaulted
   */
  public declareParameter(
    scopeType: ScopeType,
    token: IToken,
    defaulted: boolean): Maybe<Diagnostic> {
    const conflictTracker = this.lookup(token, scopeType);

    // check if variable has already been defined
    if (!empty(conflictTracker)) {
      return this.localConflictError(token, conflictTracker.declared.symbol);
    }

    let diagnostic: Maybe<Diagnostic>;

    // if global we can't shadow
    if (scopeType === ScopeType.global) {
      diagnostic = undefined;
      
    // if local check for shadowing hints
    } else {
      const shadowTracker = this.lookup(token, ScopeType.global);
      diagnostic = empty(shadowTracker)
        ? undefined
        : this.shadowSymbolHint(token, shadowTracker.declared.symbol);
    }

    const scope = this.selectScope(scopeType);
    const tracker = new KsSymbolTracker(new KsParameter(token, defaulted, SymbolState.declared));

    token.tracker = tracker;
    scope.set(token.lexeme, tracker);

    this.logger.verbose(`declare parameter ${token.lexeme} at ${rangeToString(token)}`);
    return diagnostic;
  }

  /**
   * check if the symbol exist and add a usage if it does
   * @param token token for the requested symbol
   * @param tracker symbol tracker
   * @param symbolType symbol type
   * @param expr expression context
   */
  public checkUseSymbol(
    token: IToken,
    tracker: Maybe<IKsSymbolTracker>,
    symbolType: KsSymbolKind,
    expr?: IExpr | ISuffixTerm):
    Maybe<Diagnostic> {
    // check that variable has already been defined
    if (empty(tracker)) {
      return createDiagnostic(
        token, `${symbolType} ${token.lexeme} may not exist.`, DiagnosticSeverity.Error);
    }

    token.tracker = tracker;
    tracker.usages.push(createEnitityChange(token, expr));
    this.logger.verbose(`Use ${symbolType} ${token.lexeme} at ${rangeToString(token)}`);
    return undefined;
  }

  /**
   * Lookup a variable
   * @param token token for the requested variable
   * @param scope requested scope lookup
   */
  public lookupVariable(token: IToken, scope: ScopeType): Maybe<KsVariable> {
    const tracker = this.lookupVariableTracker(token, scope);
    return tracker && tracker.declared.symbol;
  }

  /**
   * lookup a function
   * @param token token for the requested function
   * @param scope requested scope lookup
   */
  public lookupFunction(token: IToken, scope: ScopeType): Maybe<KsFunction> {
    const tracker = this.lookupFunctionTracker(token, scope);
    return tracker && tracker.declared.symbol;
  }

  /**
   * lookup a lock
   * @param token token for the requested lock
   * @param scope requested scope lookup
   */
  public lookupLock(token: IToken, scope: ScopeType): Maybe<KsLock> {
    const tracker = this.lookupLockTracker(token, scope);
    return tracker && tracker.declared.symbol;
  }

  /**
   * lookup a parameter
   * @param token token for the requested parameter
   * @param scope requested scope lookup
   */
  public lookupParameter(token: IToken, scope: ScopeType): Maybe<KsParameter> {
    const tracker = this.lookupParameterTracker(token, scope);
    return tracker && tracker.declared.symbol;
  }

  /**
   * lookup a variable tracker
   * @param token token for the requested variable
   * @param scope requested scope lookup
   */
  public lookupVariableTracker(token: IToken, scope: ScopeType):
    Maybe<IKsSymbolTracker<KsVariable>> {
    const tracker = this.lookup(token, scope);

    return !empty(tracker) && isKsVariable(tracker.declared.symbol)
      ? tracker as IKsSymbolTracker<KsVariable>
      : undefined;
  }

  /**
   * lookup a function tracker
   * @param token token for the requested function
   * @param scope requested scope lookup
   */
  public lookupFunctionTracker(token: IToken, scope: ScopeType):
    Maybe<IKsSymbolTracker<KsFunction>> {
    const tracker = this.lookup(token, scope);

    return !empty(tracker) && isKsVariable(tracker.declared.symbol)
      ? tracker as IKsSymbolTracker<KsFunction>
      : undefined;
  }

  /**
   * lookup a lock tracker
   * @param token token for the requested lock
   * @param scope requested scope lookup
   */
  public lookupLockTracker(token: IToken, scope: ScopeType):
    Maybe<IKsSymbolTracker<KsLock>> {
    const tracker = this.lookup(token, scope);

    return !empty(tracker) && isKsLock(tracker.declared.symbol)
      ? tracker as IKsSymbolTracker<KsLock>
      : undefined;
  }

  /**
   * lookup a parameter tracker
   * @param token token for the requested parameter
   * @param scope requested scope lookup
   */
  public lookupParameterTracker(token: IToken, scope: ScopeType):
    Maybe<IKsSymbolTracker<KsParameter>> {
    const tracker = this.lookup(token, scope);

    return !empty(tracker) && isKsParameter(tracker.declared.symbol)
      ? tracker as IKsSymbolTracker<KsParameter>
      : undefined;
  }

  /**
   * Lookup a symbol in the active scope stack
   * @param token token for the requested symbol
   * @param scope scope type for the lookup local or global
   */
  private lookup(token: IToken, scope: ScopeType): Maybe<IKsSymbolTracker> {
    if (scope === ScopeType.local) {
      return this.peekScope().get(token.lexeme);
    }

    const scopes = this.activeScopeStack();
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const scope = scopes[i];
      const tracker = scope.get(token.lexeme);
      if (!empty(tracker)) {
        return tracker;
      }
    }

    // check child scopes symbol is in another file
    for (const child of this.childSymbolTables) {
      const tracker = child.rootScope.scope.get(token.lexeme);
      if (!empty(tracker)) {
        return tracker;
      }
    }

    return undefined;
  }

  /**
   * Retrieve the appropriate scope
   * @param type scope type global or local
   */
  private selectScope(type: ScopeType): IScope {
    return type === ScopeType.global
      ? this.global
      : this.peekScope();
  }

  /**
   * Get the currently active scope node
   */
  private activeScopeNode(): IScopeNode {
    let scopeNode = this.rootScope;

    for (const scopeId of this.activeScopePath) {
      scopeNode = scopeNode.children[scopeId];

      if (empty(scopeNode)) {
        throw new Error(`Unable to find scope node for path ${
          JSON.stringify(this.activeScopePath)}`);
      }
    }

    return scopeNode;
  }

  /**
   * Generate an actual scope of the current scope path
   */
  private activeScopeStack(): IStack<IScope> {
    const scopes: IStack<IScope> = [this.rootScope.scope];
    let scopeNode = this.rootScope;

    for (const scopeId of this.activeScopePath) {
      scopeNode = scopeNode.children[scopeId];

      if (empty(scopeNode)) {
        throw new Error(`Unable to find scope stack for path ${
          JSON.stringify(this.activeScopePath)}`);
      }
      scopes.push(scopeNode.scope);
    }
    return scopes;
  }

  /**
   * Retrieve the currently active scope
   */
  private peekScope(): IScope {
    return this.activeScopeNode().scope;
  }

  /**
   * generate a resolver error when a declare symbol shadows with an existing on
   * @param name token for the requested symbol
   * @param symbol collided symbol
   */
  private shadowSymbolHint(name: IToken, symbol: KsSymbol): Diagnostic {
    return createDiagnostic(
      name,
      `${this.pascalCase(KsSymbolKind[symbol.tag])} ${symbol.name.lexeme} `
      + `already exists here. This ${this.pascalCase(KsSymbolKind[symbol.tag])} shadows it.`,
      DiagnosticSeverity.Warning,
      undefined,
      [
        DiagnosticRelatedInformation.create(
          { uri: this.uri, range: symbol.name },
          'Orignally declared here',
        ),
      ],
    );
  }

  /**
   * generate a resolver error when a declare symbol collides with an existing on
   * @param name token for the requested symbol
   * @param symbol collided symbol
   */
  private localConflictError(name: IToken, symbol: KsSymbol): Diagnostic {
    return createDiagnostic(
      name,
      `${this.pascalCase(KsSymbolKind[symbol.tag])} ${symbol.name.lexeme} already exists.`,
      DiagnosticSeverity.Error,
      undefined,
      [
        DiagnosticRelatedInformation.create(
          { uri: this.uri, range: symbol.name },
          'Orignally declared here',
        ),
      ],
    );
  }

  /**
   * Convert a string to pascalCase
   * @param str string
   */
  private pascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
