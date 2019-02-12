
import { TokenType, isValidIdentifier } from '../entities/tokentypes';
import {
  IParseError, IExpr, IDeclScope, IInst,
  INodeResult, RunInstType, ParseResult, ISuffix,
} from './types';
import {
  ParseError, FailedConstructor,
  failedUnknown, failedExpr,
  failedInst,
} from './parserError';
import * as Expr from './expr';
import * as Inst from './inst';
import * as Decl from './declare';
import { empty } from '../utilities/typeGuards';
import { IToken } from '../entities/types';
import { Script } from '../entities/script';
import { nodeResult } from './parseResult';
import { Token, Marker } from '../entities/token';
import { mockLogger, mockTracer } from '../utilities/logger';

type NodeConstructor = Constructor<Expr.Expr> | Constructor<Inst.Inst> | Constructor;

export class Parser {
  private tokens: IToken[];
  private current: number;
  private runInsts: RunInstType[];
  private readonly logger: ILogger;
  private readonly tracer: ITracer;

  constructor(tokens: IToken[], logger: ILogger = mockLogger, tracer: ITracer = mockTracer) {
    this.tokens = tokens.concat(this.eof(tokens));
    this.current = 0;
    this.runInsts = [];
    this.logger = logger;
    this.tracer = tracer;
  }

  // parse tokens
  public parse(): ParseResult {
    try {
      const instructions: Inst.Inst[] = [];
      let parseErrors: IParseError[] = [];

      while (!this.isAtEnd()) {
        const { value: inst, errors } = this.declaration();
        instructions.push(inst);
        parseErrors = parseErrors.concat(errors);
      }
      return {
        parseErrors,
        runInsts: this.runInsts,
        script: new Script(instructions),
      };
    } catch (err) {
      this.logger.error(`Error occured in parser ${err}`);
      this.tracer.log(err);

      return {
        runInsts: [],
        script: new Script([]),
        parseErrors: [],
      };
    }
  }

  // testing function / utility
  public parseInstruction(): INodeResult<IInst> {
    return this.declaration();
  }

  // testing function / utility
  public parseExpression(): INodeResult<IExpr> {
    try {
      return this.expression();
    } catch (error) {
      if (error instanceof ParseError) {
        this.synchronize(error.failed);

        return {
          errors: [error],
          value: new Expr.Invalid(this.tokens.slice(0, this.current)),
        };
      }
      throw error;
    }
  }

  public parseArgCount(): INodeResult<number> {
    return this.partialArgumentsCount();
  }

  // generate a placholder token as a fake end of file
  private eof(tokens: IToken[]): IToken {
    if (tokens.length === 0) {
      return new Token(
        TokenType.eof, '', undefined,
        new Marker(0, 0),
        new Marker(0, 1),
        '',
      );
    }

    const last = tokens[tokens.length - 1];
    return new Token(
      TokenType.eof, '', undefined,
      new Marker(last.end.line + 1, 0),
      new Marker(last.end.line + 1, 1),
      last.uri,
    );
  }

  // parse declaration attempt to synchronize
  private declaration(): INodeResult<IInst> {
    const start = this.current;
    try {
      if ([TokenType.declare, TokenType.local, TokenType.global,
        TokenType.parameter, TokenType.function, TokenType.lock].some(t => this.check(t))) {
        return this.define();
      }

      return this.instruction();
    } catch (error) {
      if (error instanceof ParseError) {
        this.synchronize(error.failed);

        return {
          errors: [error],
          value: new Inst.Invalid(this.tokens.slice(start, this.current)),
        };
      }
      throw error;
    }
  }

  // parse declaration instructions
  private define(): INodeResult<IInst> {
    // attempt to find scoping
    const declare = this.matchToken(TokenType.declare)
      ? this.previous()
      : undefined;

    const scope = this.matchToken(TokenType.local, TokenType.global)
      ? this.previous()
      : undefined;

    const scopeDeclare = declare || scope
      ? new Decl.Scope(scope, declare)
      : undefined;

    // match declaration
    if (this.matchToken(TokenType.function)) {
      return this.declareFunction(scopeDeclare);
    }
    if (this.matchToken(TokenType.parameter)) {
      return this.declareParameter(scopeDeclare);
    }
    if (this.matchToken(TokenType.lock)) {
      return this.declareLock(scopeDeclare);
    }
    if (scopeDeclare) {
      return this.declareVariable(scopeDeclare);
    }

    throw this.error(
      this.peek(), Decl.Scope,
      'Expected function parameter or variable declaration.',
      'Example: "local function exampleFunc { ... }", "global x is 0"');
  }

  // parse function declaration
  private declareFunction(scope?: IDeclScope): INodeResult<Decl.Func> {
    const functionToken = this.previous();
    const functionIdentiifer = this.consumeIdentifierThrow('Expected identifier', Decl.Func);

    // match function body
    if (this.matchToken(TokenType.curlyOpen)) {
      const blockResult = this.instructionBlock();
      this.matchToken(TokenType.period);

      return nodeResult(
        new Decl.Func(functionToken, functionIdentiifer, blockResult.value, scope),
        blockResult.errors,
      );
    }

    throw this.error(
      this.peek(),
      Decl.Func,
      'Expected function instruction block starting with "{"',
      'Example: local function { print "hi". }');
  }

  // parse parameter declaration
  private declareParameter(scope?: IDeclScope): INodeResult<Decl.Param> {
    const parameterToken = this.previous();

    const parameters = this.declareNormalParameters();
    const defaultParameters = this.declaredDefaultedParameters();
    this.terminal(Decl.Param);

    return nodeResult(
      new Decl.Param(parameterToken, parameters, defaultParameters.value, scope),
      defaultParameters.errors,
    );
  }

  // parse regular parameters
  private declareNormalParameters(): Decl.Parameter[] {
    const parameters = [];

    // parse paremter until defaulted
    do {
      // break if this parameter is defaulted
      if (this.checkNext(TokenType.is) || this.checkNext(TokenType.to)) break;

      const identifer = this.consumeIdentifierThrow(
        'Expected additional identiifer following comma.', Decl.Parameter);

      parameters.push(new Decl.Parameter(identifer));
    } while (this.matchToken(TokenType.comma));

    return parameters;
  }

  // parse defaulted parameters
  private declaredDefaultedParameters(): INodeResult<Decl.DefaultParam[]> {
    const defaultParameters = [];
    const errors: IParseError[][] = [];

    // parse until no additional parameters exist
    do {
      if (!this.checkNext(TokenType.is) && !this.checkNext(TokenType.to)) break;

      const identifer = this.consumeIdentifierThrow(
        'Expected identifier following comma.', Decl.DefaultParam);
      const toIs = this.consumeTokenThrow(
        'Expected default parameter using keyword "to" or "is".',
        Decl.DefaultParam, TokenType.to, TokenType.is);
      const valueResult = this.expression();
      defaultParameters.push(new Decl.DefaultParam(identifer, toIs, valueResult.value));
      errors.push(valueResult.errors);
    } while (this.matchToken(TokenType.comma));

    return nodeResult(defaultParameters, ...errors);
  }

  // parse lock instruction
  private declareLock(scope?: IDeclScope): INodeResult<Decl.Lock> {
    const lock = this.previous();
    const identifer = this.consumeIdentifierThrow(
      'Expected identifier following lock keyword.', Decl.Lock);
    const to = this.consumeTokenThrow(
      'Expected keyword "to" following lock.',
      Decl.Lock, TokenType.to);
    const valueResult = this.expression(Decl.Lock);
    this.terminal(Decl.Lock);

    return nodeResult(
      new Decl.Lock(lock, identifer, to, valueResult.value, scope),
      valueResult.errors,
    );
  }

  // parse a variable declaration, scoping occurs elseware
  private declareVariable(scope: IDeclScope): INodeResult<Decl.Var> {
    const identifer = this.consumeIdentifierThrow('Expected identifier.', Decl.Var);

    const toIs = this.consumeTokenThrow(
      'Expected keyword "to" or "is" following declare.',
      Decl.Var, TokenType.to, TokenType.is);
    const valueResult = this.expression(Decl.Var);
    this.terminal(Decl.Var);

    return nodeResult(
      new Decl.Var(identifer, toIs, valueResult.value, scope),
      valueResult.errors,
    );
  }

  // parse instruction
  private instruction(): INodeResult<IInst> {
    switch (this.peek().type) {
      case TokenType.curlyOpen:
        this.advance();
        return this.instructionBlock();
      case TokenType.integer:
      case TokenType.double:
      case TokenType.true:
      case TokenType.false:
      case TokenType.identifier:
      case TokenType.fileIdentifier:
      case TokenType.bracketOpen:
      case TokenType.string:
        // note we don't advance the token index here
        // TODO see if there exists a more general solution
        return this.identifierLedInstruction();
      case TokenType.stage:
      case TokenType.clearscreen:
      case TokenType.preserve:
      case TokenType.reboot:
      case TokenType.shutdown:
        this.advance();
        return this.command();
      case TokenType.edit:
      case TokenType.add:
      case TokenType.remove:
        this.advance();
        return this.commandExpression();
      case TokenType.unset:
        this.advance();
        return this.unset();
      case TokenType.unlock:
        this.advance();
        return this.unlock();
      case TokenType.set:
        this.advance();
        return this.set();
      case TokenType.atSign:
        this.advance();
        return this.lazyGlobal();
      case TokenType.if:
        this.advance();
        return this.ifInst();
      case TokenType.until:
        this.advance();
        return this.until();
      case TokenType.from:
        this.advance();
        return this.from();
      case TokenType.when:
        this.advance();
        return this.when();
      case TokenType.return:
        this.advance();
        return this.returnInst();
      case TokenType.break:
        this.advance();
        return this.breakInst();
      case TokenType.switch:
        this.advance();
        return this.switchInst();
      case TokenType.for:
        this.advance();
        return this.forInst();
      case TokenType.on:
        this.advance();
        return this.on();
      case TokenType.toggle:
        this.advance();
        return this.toggle();
      case TokenType.wait:
        this.advance();
        return this.wait();
      case TokenType.log:
        this.advance();
        return this.log();
      case TokenType.copy:
        this.advance();
        return this.copy();
      case TokenType.rename:
        this.advance();
        return this.rename();
      case TokenType.delete:
        this.advance();
        return this.delete();
      case TokenType.run:
        this.advance();
        return this.run();
      case TokenType.runPath:
        this.advance();
        return this.runPath();
      case TokenType.runOncePath:
        this.advance();
        return this.runPathOnce();
      case TokenType.compile:
        this.advance();
        return this.compile();
      case TokenType.list:
        this.advance();
        return this.list();
      case TokenType.print:
        this.advance();
        return this.print();
      case TokenType.period:
        return nodeResult(new Inst.Empty(this.advance()));
      default:
        throw this.error(
          this.peek(), undefined,
          'Unknown instruction found',
          'Examples: "print "hi"", "LIST.", "RUN "example.ks""');
    }
  }

  // parse a block of instructions
  private instructionBlock(): INodeResult<Inst.Block> {
    const open = this.previous();
    const declarations: Inst.Inst[] = [];

    let parseErrors: IParseError[] = [];

    // while not at end and until closing curly keep parsing instructions
    while (!this.check(TokenType.curlyClose) && !this.isAtEnd()) {
      const { value: inst, errors } = this.declaration();
      declarations.push(inst);
      parseErrors = parseErrors.concat(errors);
    }

    // check closing curly is found
    const close = this.consumeTokenReturn(
      'Expected "}" to finish instruction block',
      Inst.Block, TokenType.curlyClose);

    // throw and bundle inner error if close not found
    if (close.tag === 'parseError') {
      close.inner = parseErrors;
      throw close;
    }

    return nodeResult(new Inst.Block(open, declarations, close), parseErrors);
  }

  // parse an instruction lead with a identifier
  private identifierLedInstruction(): INodeResult<IInst> {
    const suffix = this.suffixCatch(Inst.Expr);

    if (this.matchToken(TokenType.on, TokenType.off)) {
      const onOff = this.onOff(suffix.value);
      return nodeResult(onOff.value, suffix.errors, onOff.errors);
    }
    this.terminal(Inst.Expr);

    return nodeResult(
      new Inst.Expr(suffix.value),
      suffix.errors,
    );
  }

  // parse on off statement
  private onOff(suffix: ISuffix): INodeResult<Inst.OnOff> {
    const onOff = this.previous();
    this.terminal(Inst.OnOff);

    return nodeResult(new Inst.OnOff(suffix, onOff));
  }

  // parse command instruction
  private command(): INodeResult<Inst.Command> {
    const command = this.previous();
    this.terminal(Inst.Command);

    return nodeResult(new Inst.Command(command));
  }

  // parse command instruction
  private commandExpression(): INodeResult<Inst.CommandExpr> {
    const command = this.previous();
    const expr = this.expression(Inst.CommandExpr);
    this.terminal(Inst.CommandExpr);

    return nodeResult(
      new Inst.CommandExpr(command, expr.value),
      expr.errors,
    );
  }

  // parse unset instruction
  private unset(): INodeResult<Inst.Unset> {
    const unset = this.previous();
    const identifer = this.consumeTokenThrow(
      'Excpeted identifier or "all" following keyword "unset".',
      Inst.Unset, TokenType.identifier, TokenType.all);
    this.terminal(Inst.Unset);

    return nodeResult(new Inst.Unset(unset, identifer));
  }

  // parse unlock instruction
  private unlock(): INodeResult<Inst.Unlock> {
    const unlock = this.previous();
    const identifer = this.consumeTokenThrow(
      'Excpeted identifier or "all" following keyword "unlock".',
      Inst.Unlock, TokenType.identifier, TokenType.all);
    this.terminal(Inst.Unlock);

    return nodeResult(new Inst.Unlock(unlock, identifer));
  }

  // parse set instruction
  private set(): INodeResult<Inst.Set> {
    const set = this.previous();
    const suffix = this.suffixCatch(Inst.Set);
    const to = this.consumeTokenThrow(
      'Expected "to" following keyword "set".',
      Inst.Set, TokenType.to);
    const valueResult = this.expression(Inst.Set);
    this.terminal(Inst.Set);

    return nodeResult(
      new Inst.Set(set, suffix.value, to, valueResult.value),
      suffix.errors,
      valueResult.errors,
    );
  }

  // parse lazy global
  private lazyGlobal(): INodeResult<Inst.LazyGlobal> {
    const atSign = this.previous();
    const lazyGlobal = this.consumeTokenThrow(
      'Expected keyword "lazyGlobal" following @.',
      Inst.LazyGlobal, TokenType.lazyGlobal);

    const onOff = this.consumeTokenThrow(
      'Expected "on" or "off" following lazy global directive.',
      Inst.LazyGlobal, TokenType.on, TokenType.off);
    this.terminal(Inst.LazyGlobal);

    return nodeResult(new Inst.LazyGlobal(atSign, lazyGlobal, onOff));
  }

  // parse if instruction
  private ifInst(): INodeResult<Inst.If> {
    const ifToken = this.previous();
    const conditionResult = this.expression(Inst.If);

    const inst = this.declaration();
    this.matchToken(TokenType.period);

    // if else if found parse that branch
    if (this.matchToken(TokenType.else)) {
      const elseToken = this.previous();
      const elseResult = this.declaration();

      const elseInst = new Inst.Else(elseToken, elseResult.value);
      this.matchToken(TokenType.period);
      return nodeResult(
        new Inst.If(ifToken, conditionResult.value, inst.value, elseInst),
        conditionResult.errors,
        inst.errors,
        elseResult.errors,
      );
    }

    return nodeResult(
      new Inst.If(ifToken, conditionResult.value, inst.value),
      inst.errors,
    );
  }

  // parse until instruction
  private until(): INodeResult<Inst.Until> {
    const until = this.previous();
    const conditionResult = this.expression(Inst.Until);
    const inst = this.declaration();
    this.matchToken(TokenType.period);

    return nodeResult(
      new Inst.Until(until, conditionResult.value, inst.value),
      conditionResult.errors,
      inst.errors,
    );
  }

  // parse from instruction
  private from(): INodeResult<Inst.From> {
    const from = this.previous();
    if (this.matchToken(TokenType.curlyOpen)) {
      const initResult = this.instructionBlock();
      const until = this.consumeTokenThrow(
        'Expected "until" expression following from.',
        Inst.From, TokenType.until);
      const conditionResult = this.expression(Inst.From);
      const step = this.consumeTokenThrow(
        'Expected "step" statment following until.',
        Inst.From, TokenType.step);
      if (this.matchToken(TokenType.curlyOpen)) {
        const incrementResult = this.instructionBlock();
        const doToken = this.consumeTokenThrow(
          'Expected "do" block following step.',
          Inst.From, TokenType.do);
        const inst = this.declaration();
        return nodeResult(
          new Inst.From(
            from, initResult.value, until, conditionResult.value,
            step, incrementResult.value, doToken, inst.value,
          ),
          initResult.errors,
          conditionResult.errors,
          incrementResult.errors,
          inst.errors,
        );
      }
      throw this.error(
        this.peek(), Inst.From,
        'Expected "{" followed by step block logic.',
        'Example: FROM {LOCAL x is 0.} UNTIL x >= 10 STEP { set x to x + 1. } { print x. }');
    }
    throw this.error(
      this.peek(), Inst.From,
      'Expected "{" followed by initializer logic',
      'Example: FROM {LOCAL x is 0.} UNTIL x >= 10 STEP { set x to x + 1. } { print x. }');
  }

  // parse when instruction
  private when(): INodeResult<Inst.When> {
    const when = this.previous();
    const conditionResult = this.expression(Inst.When);

    const then = this.consumeTokenThrow(
      'Expected "then" following "when" condition.',
      Inst.When, TokenType.then);
    const inst = this.declaration();
    this.matchToken(TokenType.period);

    return nodeResult(
      new Inst.When(when, conditionResult.value, then, inst.value),
      conditionResult.errors,
      inst.errors,
    );
  }

  // parse return instruction
  private returnInst(): INodeResult<Inst.Return> {
    const returnToken = this.previous();
    const valueResult = !this.check(TokenType.period)
      ? this.expression(Inst.Return)
      : undefined;
    this.terminal(Inst.Return);

    if (empty(valueResult)) {
      return nodeResult(new Inst.Return(returnToken, valueResult));
    }

    return nodeResult(
      new Inst.Return(returnToken, valueResult.value),
      valueResult.errors,
    );
  }

  // parse return instruction
  private breakInst(): INodeResult<Inst.Break> {
    const breakToken = this.previous();
    this.terminal(Inst.Break);

    return nodeResult(new Inst.Break(breakToken));
  }

  // parse switch instruction
  private switchInst(): INodeResult<Inst.Switch> {
    const switchToken = this.previous();
    const to = this.consumeTokenThrow(
      'Expected "to" following keyword "switch".',
      Inst.Switch, TokenType.to);
    const targetResult = this.expression(Inst.Switch);
    this.terminal(Inst.Switch);

    return nodeResult(
      new Inst.Switch(switchToken, to, targetResult.value),
      targetResult.errors,
    );
  }

  // parse for instruction
  private forInst(): INodeResult<Inst.For> {
    const forToken = this.previous();
    const identifer = this.consumeIdentifierThrow(
      'Expected identifier. following keyword "for"', Inst.For);
    const inToken = this.consumeTokenThrow(
      'Expected "in" after "for" loop variable.',
      Inst.For, TokenType.in);
    const suffix = this.suffixCatch(Inst.For);
    const inst = this.declaration();
    this.matchToken(TokenType.period);

    return nodeResult(
      new Inst.For(forToken, identifer, inToken, suffix.value, inst.value),
      suffix.errors,
      inst.errors,
    );
  }

  // parse on instruction
  private on(): INodeResult<Inst.On> {
    const on = this.previous();
    const suffix = this.suffixCatch(Inst.On);
    const inst = this.declaration();

    return nodeResult(
      new Inst.On(on, suffix.value, inst.value),
      suffix.errors,
      inst.errors,
    );
  }

  // parse toggle instruction
  private toggle(): INodeResult<Inst.Toggle> {
    const toggle = this.previous();
    const suffix = this.suffixCatch(Inst.Toggle);
    this.terminal(Inst.Toggle);

    return nodeResult(
      new Inst.Toggle(toggle, suffix.value),
      suffix.errors,
    );
  }

  // parse wait instruction
  private wait(): INodeResult<Inst.Wait> {
    const wait = this.previous();
    const until = this.matchToken(TokenType.until)
      ? this.previous()
      : undefined;

    const expr = this.expression(Inst.Wait);
    this.terminal(Inst.Wait);

    return nodeResult(
      new Inst.Wait(wait, expr.value, until),
      expr.errors,
    );
  }

  // parse log instruction
  private log(): INodeResult<Inst.Log> {
    const log = this.previous();
    const expr = this.expression(Inst.Log);
    const to = this.consumeTokenThrow(
      'Expected "to" following "log" expression.',
      Inst.Log, TokenType.to);
    const targetResult = this.expression(Inst.Log);
    this.terminal(Inst.Log);

    return nodeResult(
      new Inst.Log(log, expr.value, to, targetResult.value),
      expr.errors,
      targetResult.errors,
    );
  }

  // parse copy instruction
  private copy(): INodeResult<Inst.Copy> {
    const copy = this.previous();
    const expr = this.expression(Inst.Copy);
    const toFrom = this.consumeTokenThrow(
      'Expected "to" or "from" following "copy" expression.',
      Inst.Copy, TokenType.from, TokenType.to);
    const targetResult = this.expression(Inst.Copy);
    this.terminal(Inst.Copy);

    return nodeResult(
      new Inst.Copy(copy, expr.value, toFrom, targetResult.value),
      expr.errors,
      targetResult.errors,
    );
  }

  // parse rename instruction
  private rename(): INodeResult<Inst.Rename> {
    const rename = this.previous();
    const fileVolume = this.consumeTokenThrow(
      'Expected file or volume following keyword "rename"',
      Inst.Rename, TokenType.volume, TokenType.file);

    const ioIdentifier = this.consumeTokenThrow(
      'Expected identifier or file identifier following keyword "rename"',
      Inst.Rename, TokenType.identifier, TokenType.fileIdentifier);

    const expr = this.expression(Inst.Rename);
    const to = this.consumeTokenThrow(
      'Expected "to" following keyword "rename".',
      Inst.Rename, TokenType.to);
    const targetResult = this.expression(Inst.Rename);
    this.terminal(Inst.Rename);

    return nodeResult(
      new Inst.Rename(rename, fileVolume, ioIdentifier, expr.value, to, targetResult.value),
      expr.errors,
      targetResult.errors,
    );
  }

  // parse delete instruction
  private delete(): INodeResult<Inst.Delete> {
    const deleteToken = this.previous();
    const expr = this.expression(Inst.Delete);

    if (this.matchToken(TokenType.from)) {
      const from = this.previous();
      const targetResult = this.expression(Inst.Delete);
      this.terminal(Inst.Delete);

      return nodeResult(
        new Inst.Delete(deleteToken, expr.value, from, targetResult.value),
        expr.errors,
        targetResult.errors,
      );
    }

    this.terminal(Inst.Delete);
    return nodeResult(
      new Inst.Delete(deleteToken, expr.value),
      expr.errors,
    );
  }

  // parse run instruction
  private run(): INodeResult<Inst.Run> {
    const run = this.previous();
    const once = this.matchToken(TokenType.once)
      ? this.previous()
      : undefined;

    const identifier = this.consumeTokenThrow(
      'Expected string or fileidentifier following keyword "run".', Inst.Run,
      TokenType.string, TokenType.identifier, TokenType.fileIdentifier);

    let open = undefined;
    let args = undefined;
    let close = undefined;

    // parse arguments if found
    if (this.matchToken(TokenType.bracketOpen)) {
      open = this.previous();
      args = this.arguments();
      close = this.consumeTokenThrow(
        'Expected ")" after "run" arguments.',
        Inst.Run,
        TokenType.bracketClose);
    }

    let on = undefined;
    let expr = undefined;

    // parse arguments if found
    if (this.matchToken(TokenType.on)) {
      on = this.previous();
      args = this.arguments();
      expr = this.expression(Inst.Run);
    }

    this.terminal(Inst.Run);
    // handle all the cases
    if (empty(expr)) {
      if (empty(args)) {
        return this.addRunInst(
          new Inst.Run(run, identifier, once, open, args, close, on, expr),
        );
      }

      return this.addRunInst(
        new Inst.Run(run, identifier, once, open, args.value, close, on, expr),
        args.errors,
      );
    }

    if (empty(args)) {
      return this.addRunInst(
        new Inst.Run(run, identifier, once, open, args, close, on, expr.value),
        expr.errors,
      );
    }

    return this.addRunInst(
      new Inst.Run(run, identifier, once, open, args.value, close, on, expr.value),
      args.errors,
      expr.errors,
    );
  }

  // parse run path instruction
  private runPath(): INodeResult<Inst.RunPath> {
    const runPath = this.previous();
    const open = this.consumeTokenThrow(
      'Expected "(" after keyword "runPath".',
      Inst.RunPath,
      TokenType.bracketOpen);
    const expr = this.expression(Inst.RunPath);
    const args = this.matchToken(TokenType.comma)
      ? this.arguments()
      : undefined;

    const close = this.consumeTokenThrow(
      'Expected ")" after runPath arguments.',
      Inst.RunPath, TokenType.bracketClose);
    this.terminal(Inst.RunPath);

    if (empty(args)) {
      return this.addRunInst(
        new Inst.RunPath(runPath, open, expr.value, close, args),
        expr.errors,
      );
    }

    return this.addRunInst(
      new Inst.RunPath(runPath, open, expr.value, close, args.value),
      expr.errors,
      args.errors,
    );
  }

  // parse run path once instruction
  private runPathOnce(): INodeResult<Inst.RunPathOnce> {
    const runPath = this.previous();
    const open = this.consumeTokenThrow(
      'Expected "(" after keyword "runPathOnce".',
      Inst.RunPathOnce, TokenType.bracketOpen);
    const expr = this.expression(Inst.RunPathOnce);
    const args = this.matchToken(TokenType.comma)
      ? this.arguments()
      : undefined;

    const close = this.consumeTokenThrow(
      'Expected ")" after runPathOnce arugments.',
      Inst.RunPathOnce, TokenType.bracketClose);
    this.terminal(Inst.RunPathOnce);

    if (empty(args)) {
      return this.addRunInst(
        new Inst.RunPathOnce(runPath, open, expr.value, close, args),
        expr.errors,
      );
    }

    return this.addRunInst(
      new Inst.RunPathOnce(runPath, open, expr.value, close, args.value),
      expr.errors,
      args.errors,
    );
  }

  // parse compile instruction
  private compile(): INodeResult<Inst.Compile> {
    const compile = this.previous();
    const expr = this.expression(Inst.Compile);
    if (this.matchToken(TokenType.to)) {
      const to = this.previous();
      const targetResult = this.expression(Inst.Compile);
      this.terminal(Inst.Compile);

      return nodeResult(
        new Inst.Compile(compile, expr.value, to, targetResult.value),
        expr.errors,
        targetResult.errors,
      );
    }

    this.terminal(Inst.Compile);
    return nodeResult(
      new Inst.Compile(compile, expr.value),
      expr.errors,
    );
  }

  // parse list instruction
  private list(): INodeResult<Inst.List> {
    const list = this.previous();
    let identifier = undefined;
    let inToken = undefined;
    let target = undefined;

    if (this.matchIdentifier()) {
      identifier = this.previous();
      if (this.matchToken(TokenType.in)) {
        inToken = this.previous();
        target = this.consumeIdentifierThrow(
          'Expected identifier after "in" keyword in "list" command', Inst.List);
      }
    }
    this.terminal(Inst.List);

    return nodeResult(new Inst.List(list, identifier, inToken, target));
  }

  // parse print instruction
  private print(): INodeResult<Inst.Print> {
    const print = this.previous();
    const expr = this.expression(Inst.Print);

    if (this.matchToken(TokenType.at)) {
      const at = this.previous();
      const open = this.consumeTokenThrow(
        'Expected "(".', Inst.Print, TokenType.bracketOpen);
      const xResult = this.expression(Inst.Print);
      this.consumeTokenThrow('Expected ",".', Inst.Print, TokenType.comma);
      const yResult = this.expression(Inst.Print);
      const close = this.consumeTokenThrow(
        'Expected ")".', Inst.Print, TokenType.bracketClose);

      this.terminal(Inst.Print);
      return nodeResult(
        new Inst.Print(print, expr.value, at, open, xResult.value, yResult.value, close),
        expr.errors,
        xResult.errors,
        yResult.errors,
      );
    }

    this.terminal(Inst.Print);
    return nodeResult(
      new Inst.Print(print, expr.value),
      expr.errors,
    );
  }

  // parse any expression
  private expression(inst?: Constructor<Inst.Inst>): INodeResult<IExpr> {
    try {
      // match anonymous function
      if (this.matchToken(TokenType.curlyOpen)) {
        return this.anonymousFunction();
      }

      // other match conditional
      return this.or();
    } catch (error) {
      if (error instanceof ParseError) {
        error.failed.inst = inst;
        throw error;
      }

      throw error;
    }
  }

  // parse or expression
  private or(): INodeResult<IExpr> {
    return this.binaryExpression(this.and.bind(this), TokenType.or);
  }

  // parse and expression
  private and(): INodeResult<IExpr> {
    return this.binaryExpression(this.equality.bind(this), TokenType.and);
  }

  // parse equality expression
  private equality(): INodeResult<IExpr> {
    return this.binaryExpression(
      this.comparison.bind(this), TokenType.equal, TokenType.notEqual);
  }

  // parse comparison expression
  private comparison(): INodeResult<IExpr> {
    return this.binaryExpression(
      this.addition.bind(this), TokenType.less, TokenType.greater,
      TokenType.lessEqual, TokenType.greaterEqual);
  }

  // parse addition expression
  private addition(): INodeResult<IExpr> {
    return this.binaryExpression(
      this.multiplication.bind(this), TokenType.plus, TokenType.minus);
  }

  // parse multiplication expression
  private multiplication(): INodeResult<IExpr> {
    return this.binaryExpression(
      this.unary.bind(this), TokenType.multi, TokenType.div);
  }

  // binary expression parser
  private binaryExpression = (recurse: () => INodeResult<IExpr>, ...types: TokenType[]):
    INodeResult<IExpr> => {
    let expr = recurse();

    while (this.matchToken(...types)) {
      const operator = this.previous();
      const right = recurse();
      expr = nodeResult(
        new Expr.Binary(expr.value, operator, right.value),
        expr.errors,
        right.errors,
      );
    }

    return expr;
  }

  // parse unary expression
  private unary(): INodeResult<IExpr> {
    // if unary token found parse as unary
    if (this.matchToken(
      TokenType.plus, TokenType.minus,
      TokenType.not, TokenType.defined)) {

      const operator = this.previous();
      const unary = this.unary();
      return nodeResult(
        new Expr.Unary(operator, unary.value),
        unary.errors,
      );
    }

    // else parse plain factor
    return this.factor();
  }

  // parse factor expression
  private factor(): INodeResult<IExpr> {
    // parse suffix
    let expr: INodeResult<IExpr> = this.suffix();

    // parse seqeunce of factors if they exist
    while (this.matchToken(TokenType.power)) {
      const power = this.previous();
      const exponenent = this.suffix();
      expr = nodeResult(
        new Expr.Factor(expr.value, power, exponenent.value),
        exponenent.errors,
      );
    }

    return expr;
  }

  // parse suffix for use in inst directly, will catch
  private suffixCatch(inst: Constructor<Inst.Inst>): INodeResult<ISuffix> {
    try {
      return this.suffix();
    } catch (error) {
      if (error instanceof ParseError) {
        error.failed.inst = inst;
        throw error;
      }

      throw error;
    }
  }

  // parse suffix
  private suffix(): INodeResult<ISuffix> {
    let expr = this.suffixTerm(false);

    // while colons are found parse all trailers
    while (this.matchToken(TokenType.colon)) {
      const trailer = this.suffixTrailer(expr.value);
      expr = nodeResult(trailer.value, expr.errors, trailer.errors);
    }

    return expr;
  }

  // parse suffix trailer expression
  private suffixTrailer(suffix: Expr.Expr): INodeResult<Expr.Suffix> {
    const colon = this.previous();
    const trailer = this.suffixTerm(true);
    return nodeResult(
      new Expr.Suffix(suffix, colon, trailer.value),
      trailer.errors,
    );
  }

  // parse suffix term expression
  private suffixTerm(isTrailer: boolean): INodeResult<ISuffix> {
    // parse primary
    let expr = this.atom(isTrailer);

    // parse any trailers that exist
    while (true) {
      if (this.matchToken(TokenType.arrayIndex)) {
        const index = this.arrayIndex(expr.value, isTrailer);
        expr = nodeResult(index.value, expr.errors, index.errors);
      } else if (this.matchToken(TokenType.squareOpen)) {
        const bracket = this.arrayBracket(expr.value, isTrailer);
        expr = nodeResult(bracket.value, expr.errors, bracket.errors);
      } else if (this.matchToken(TokenType.bracketOpen)) {
        const trailer = this.functionTrailer(expr.value, isTrailer);
        expr = nodeResult(trailer.value, expr.errors, trailer.errors);
      } else if (this.matchToken(TokenType.atSign)) {
        return nodeResult(
          new Expr.Delegate(expr.value, this.previous(), isTrailer),
          expr.errors,
        );
      } else {
        break;
      }
    }

    return expr;
  }

  // function call
  private functionTrailer(callee: Expr.Expr, isTrailer: boolean): INodeResult<Expr.Call> {
    const open = this.previous();
    const args = this.arguments();
    const close = this.consumeTokenThrow(
      'Expect ")" after arguments.',
      Expr.Call, TokenType.bracketClose);

    return nodeResult(
      new Expr.Call(callee, open, args.value, close, isTrailer),
      args.errors,
    );
  }

  // get an argument list
  private partialArgumentsCount(): INodeResult<number> {
    let count = -1;

    if (!this.check(TokenType.bracketClose)) {
      do {
        count += 1;
        if (this.isAtEnd()) break;
        this.expression();
      } while (this.matchToken(TokenType.comma));
    }

    return nodeResult(count < 0 ? 0 : count);
  }

  // get an argument list
  private arguments(): INodeResult<IExpr[]> {
    const args: IExpr[] = [];
    const errors: IParseError[][] = [];

    if (!this.isAtEnd() && !this.check(TokenType.bracketClose)) {
      do {
        const arg = this.expression();
        args.push(arg.value);
        errors.push(arg.errors);
      } while (this.matchToken(TokenType.comma));
    }

    return nodeResult(args, ...errors);
  }

  // generate array bracket expression
  private arrayBracket(array: Expr.Expr, isTrailer: boolean): INodeResult<Expr.ArrayBracket> {
    const open = this.previous();
    const index = this.expression();

    const close = this.consumeTokenThrow(
      'Expected "]" at end of array index.',
      Expr.ArrayBracket, TokenType.squareClose);

    return nodeResult(
      new Expr.ArrayBracket(array, open, index.value, close, isTrailer),
      index.errors,
    );
  }

  // generate array index expression
  private arrayIndex(array: Expr.Expr, isTrailer: boolean): INodeResult<Expr.ArrayIndex> {
    const indexer = this.previous();

    // check for integer or identifier
    const index = this.consumeTokenThrow(
      'Expected integer or identifer.',
      Expr.ArrayIndex, TokenType.integer, TokenType.identifier);

    return nodeResult(new Expr.ArrayIndex(array, indexer, index, isTrailer));
  }

  // TODO this returns a delegate
  // parse anonymous function
  private anonymousFunction(): INodeResult<Expr.AnonymousFunction> {
    const open = this.previous();
    const declarations: Inst.Inst[] = [];
    let parseErrors: IParseError[] = [];

    // while not at end and until closing curly keep parsing instructions
    while (!this.check(TokenType.curlyClose) && !this.isAtEnd()) {
      const { value: inst, errors } = this.declaration();
      declarations.push(inst);
      parseErrors = parseErrors.concat(errors);
    }

    // check closing curly is found
    const close = this.consumeTokenThrow(
      'Expected "}" to finish instruction block',
      Expr.AnonymousFunction, TokenType.curlyClose);

    // if inner errors found bundle and throw
    if (parseErrors.length > 0) {
      const error = this.error(
        open, Expr.AnonymousFunction, 'Error found in this block.');
      error.inner = parseErrors;
      throw error;
    }
    return nodeResult(
      new Expr.AnonymousFunction(open, declarations, close),
      parseErrors,
    );
  }

  // match atom expressions literals, identifers, list, and parenthesis
  private atom(isTrailer: boolean): INodeResult<ISuffix> {
    // match all literals
    if (this.matchToken(
      TokenType.false, TokenType.true, TokenType.fileIdentifier,
      TokenType.string, TokenType.integer, TokenType.double)) {
      return nodeResult(new Expr.Literal(this.previous(), isTrailer));
    }

    // match identifiers TODO identifier all keywords that can be used here
    if (isValidIdentifier(this.peek().type)) {
      return nodeResult(new Expr.Variable(this.advance(), isTrailer));
    }

    // match grouping expression
    if (this.matchToken(TokenType.bracketOpen)) {
      const open = this.previous();
      const expr = this.expression();
      const close = this.consumeTokenThrow(
        'Expect ")" after expression',
        Expr.Grouping, TokenType.bracketClose);

      return nodeResult(
        new Expr.Grouping(open, expr.value, close, isTrailer),
        expr.errors,
      );
    }

    // valid expression not found
    throw this.error(this.peek(), undefined, 'Expected expression.');
  }

  private addRunInst<T extends RunInstType>(inst: T, ...errors: IParseError[][]): INodeResult<T> {
    this.runInsts.push(inst);
    return nodeResult(inst, ...errors);
  }

  // check for period
  private terminal(failed: NodeConstructor): IToken {
    return this.consumeTokenThrow('Expected ".".', failed, TokenType.period);
  }

  // check for any valid identifier
  // throws errors if incorrect token is found
  private consumeIdentifierThrow(message: string, failed: NodeConstructor): IToken {
    if (this.matchIdentifier()) return this.previous();
    throw this.error(this.previous(), failed, message);
  }

  // consume current token if it matches type.
  // throws errors if incorrect token is found
  private consumeTokenThrow(
    message: string,
    failed: NodeConstructor,
    ...tokenType: TokenType[]): IToken {
    if (this.matchToken(...tokenType)) return this.previous();
    throw this.error(this.previous(), failed, message);
  }

  // consume current token if it matches type.
  // returns errors if incorrect token is found
  private consumeTokenReturn(
    message: string,
    failed: NodeConstructor,
    ...tokenType: TokenType[]): IToken | IParseError {
    if (this.matchToken(...tokenType)) return this.previous();
    return this.error(this.previous(), failed, message);
  }

  // was identifier matched
  private matchIdentifier(): boolean {
    const found = this.identifierCheck();
    if (found) this.advance();

    return found;
  }

  // determine if current token matches a set of tokens
  private matchToken(...types: TokenType[]): boolean {
    const found = types.some(t => this.check(t));
    if (found) this.advance();

    return found;
  }

  // check if current token can be an identifier
  private identifierCheck(): boolean {
    if (this.isAtEnd()) return false;
    return isValidIdentifier(this.peek().type);
  }

  // check if current token matches expected type
  private check(tokenType: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === tokenType;
  }

  // check if the next token matches expected type
  private checkNext(tokenType: TokenType): boolean {
    const nextToken = this.peekNext();
    if (empty(nextToken)) return false;
    return nextToken.type === tokenType;
  }

  // return current token and advance
  private advance(): IToken {
    if (!this.isAtEnd()) {
      this.current += 1;
    }
    return this.previous();
  }

  // is parse at the end of file
  private isAtEnd(): boolean {
    return this.peek().type === TokenType.eof;
  }

  // peek current token
  private peek(): IToken {
    return this.tokens[this.current];
  }

  // peek next token
  private peekNext(): Maybe<IToken> {
    const nextToken = this.tokens[this.current + 1];
    if (empty(nextToken) || nextToken.type === TokenType.eof) return undefined;

    return nextToken;
  }

  // retrieve previous token
  private previous(): IToken {
    return this.tokens[this.current - 1];
  }

  // report parse error
  private error(
    token: IToken,
    failed: Maybe<NodeConstructor>,
    message: string,
    ...extraInfo: string[]): IParseError {
    if (empty(failed)) {
      return new ParseError(token, failedUnknown(), message, extraInfo);
    }

    if (failed.prototype instanceof Expr.Expr) {
      return new ParseError(token, failedExpr(failed as {new(): Expr.Expr}), message, extraInfo);
    }
    if (failed.prototype instanceof Inst.Inst) {
      return new ParseError(token, failedInst(failed as {new(): Inst.Inst}), message, extraInfo);
    }

    return new ParseError(token, failedUnknown(), message, extraInfo);
  }

  // attempt to synchronize parser
  private synchronize(failed: FailedConstructor): void {
    // need to confirm this is the only case
    if (empty(failed.inst)) {
      this.advance();
    }

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.period) return;

      switch (this.peek().type) {
        // declarations
        case TokenType.declare:
        case TokenType.function:
        case TokenType.parameter:
        case TokenType.lock:
        case TokenType.local:
        case TokenType.global:

        // commands
        case TokenType.stage:
        case TokenType.clearscreen:
        case TokenType.preserve:
        case TokenType.reboot:
        case TokenType.shutdown:

        // command expressions
        case TokenType.edit:
        case TokenType.add:
        case TokenType.remove:

        // variable instructions
        case TokenType.unset:
        case TokenType.unlock:
        case TokenType.set:

        // control flow
        case TokenType.if:
        case TokenType.until:
        case TokenType.from:
        case TokenType.when:
        case TokenType.return:
        case TokenType.break:
        case TokenType.switch:
        case TokenType.for:
        case TokenType.on:
        case TokenType.toggle:
        case TokenType.wait:

        // io instructions
        case TokenType.log:
        case TokenType.copy:
        case TokenType.rename:
        case TokenType.delete:
        case TokenType.run:
        case TokenType.runPath:
        case TokenType.runOncePath:
        case TokenType.compile:
        case TokenType.list:
        case TokenType.print:

        // close scope
        case TokenType.curlyClose:
          return;
        default:
          break;
      }

      this.advance();
    }
  }
}
