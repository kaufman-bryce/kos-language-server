import { IExprVisitor, IInstVisitor, IInst, IExpr, IFindResult, INode } from './types';
import { DeclVariable, DeclLock, DeclFunction, DeclParameter, Parameter } from './declare';
import * as Inst from './inst';
import * as Expr from './expr';
import { Position } from 'vscode-languageserver';
import { binarySearch } from '../utilities/positionHelpers';
import { empty } from '../utilities/typeGuards';
import { Token } from '../entities/token';

export class SyntaxTreeFind implements
  IExprVisitor<Maybe<IFindResult>>,
  IInstVisitor<Maybe<IFindResult>> {

  private pos: Position;
  private contexts: Function[];

  constructor() {
    this.pos = {
      line: 0,
      character: 0,
    };
    this.contexts = [];
  }

  public find(syntaxNode: INode, pos: Position, ...contexts: Function[]): Maybe<IFindResult> {
    this.pos = pos;
    this.contexts = contexts;
    return this.findNode(syntaxNode);
  }

  private findNode(node: INode): Maybe<IFindResult> {
    const searchResult = binarySearch(node.ranges, this.pos);
    if (empty(searchResult)) {
      return searchResult;
    }

    // search expression if expression
    if (searchResult instanceof Expr.Expr) {
      const findResult = this.findExpr(searchResult);

      // add context if not set yet
      if (!empty(findResult) && this.addContext(findResult, node)) {
        findResult.node = node;
      }

      return findResult;
    }

    // search instruction if instruction
    if (searchResult instanceof Inst.Inst) {
      const findResult = this.findInst(searchResult);

      // add context if not set yet
      if (!empty(findResult) && this.addContext(findResult, node)) {
        findResult.node = node;
      }

      return findResult;
    }

    if (searchResult instanceof Parameter) {
      return {
        node: this.isContext(node)
          ? node
          : undefined,
        token: searchResult.identifier,
      };
    }

    // return result if token found
    if (searchResult instanceof Token) {
      return {
        node: this.isContext(node)
          ? node
          : undefined,
        token: searchResult,
      };
    }

    throw new Error('Unexpected result found.');
  }

  private addContext(findResult: IFindResult, node: INode): boolean {
    return empty(findResult.node) && this.isContext(node);
  }

  // is the correct context
  private isContext(node: INode): boolean {
    return this.contexts.some(context => node instanceof context);
  }

  // find an instruction
  private findInst(inst: IInst): Maybe<IFindResult> {
    return inst.accept(this);
  }

  // find an expression
  private findExpr(expr: IExpr): Maybe<IFindResult> {
    return expr.accept(this);
  }

  visitDeclVariable(decl: DeclVariable): Maybe<IFindResult> {
    return this.findNode(decl);
  }
  visitDeclLock(decl: DeclLock): Maybe<IFindResult> {
    return this.findNode(decl);
  }
  visitDeclFunction(decl: DeclFunction): Maybe<IFindResult> {
    return this.findNode(decl);
  }
  visitDeclParameter(decl: DeclParameter): Maybe<IFindResult> {
    return this.findNode(decl);
  }
  visitInstInvalid(inst: Inst.Invalid): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitBlock(inst: Inst.Block): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitExpr(inst: Inst.Expr): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitOnOff(inst: Inst.OnOff): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitCommand(inst: Inst.Command): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitCommandExpr(inst: Inst.CommandExpr): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitUnset(inst: Inst.Unset): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitUnlock(inst: Inst.Unlock): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitSet(inst: Inst.Set): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitLazyGlobalInst(inst: Inst.LazyGlobal): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitIf(inst: Inst.If): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitElse(inst: Inst.Else): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitUntil(inst: Inst.Until): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitFrom(inst: Inst.From): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitWhen(inst: Inst.When): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitReturn(inst: Inst.Return): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitBreak(inst: Inst.Break): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitSwitch(inst: Inst.Switch): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitFor(inst: Inst.For): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitOn(inst: Inst.On): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitToggle(inst: Inst.Toggle): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitWait(inst: Inst.Wait): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitLog(inst: Inst.Log): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitCopy(inst: Inst.Copy): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitRename(inst: Inst.Rename): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitDelete(inst: Inst.Delete): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitRun(inst: Inst.Run): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitRunPath(inst: Inst.RunPath): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitRunPathOnce(inst: Inst.RunPathOnce): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitCompile(inst: Inst.Compile): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitList(inst: Inst.List): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitEmpty(inst: Inst.Empty): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitPrint(inst: Inst.Print): Maybe<IFindResult> {
    return this.findNode(inst);
  }
  visitExprInvalid(expr: Expr.Invalid): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitBinary(expr: Expr.Binary): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitUnary(expr: Expr.Unary): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitFactor(expr: Expr.Factor): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitSuffix(expr: Expr.Suffix): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitCall(expr: Expr.Call): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitArrayIndex(expr: Expr.ArrayIndex): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitArrayBracket(expr: Expr.ArrayBracket): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitDelegate(expr: Expr.Delegate): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitLiteral(expr: Expr.Literal): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitVariable(expr: Expr.Variable): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitGrouping(expr: Expr.Grouping): Maybe<IFindResult> {
    return this.findNode(expr);
  }
  visitAnonymousFunction(expr: Expr.AnonymousFunction): Maybe<IFindResult> {
    return this.findNode(expr);
  }
}
