import {
  JsAccess,
  JsArray,
  JsAssign,
  JsAtomDeclare,
  JsBinaryOp,
  JsBooleanLiteralEx,
  JsCall,
  JsConst,
  JsConstruct,
  JsDeclareVar,
  JsDef,
  JsEnumDeclare,
  type JsExpression,
  type JsFile,
  JsFlow,
  JsFlowGet,
  JsFunctionStatement,
  JsIdentifierEx,
  JsIf,
  JsImport,
  JsLambdaEx,
  JsNumberLiteralEx,
  JsProjection,
  JsReassign,
  JsReturn,
  JsSingleton,
  type JsStatement,
  JsStringLiteralEx,
  JsStructDeclare,
  JsTupleDeclare,
  JsUndefined,
  JsVariable
} from "./jsIr.ts";
import { createWriteStream, mkdirSync, existsSync, WriteStream } from 'node:fs';


export class JsEmitter {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
  }

  async emitFile(file: JsFile): Promise<void> {
    const writer = createWriteStream(`${this.#dir}/${file.name}`, { encoding: 'utf-8' });
    new Output(writer).writeFile(file);

    await new Promise<void>((resolve, reject) => {
      writer.close(err => {
        if (err == null) {
          resolve();
        } else {
          reject(err);
        }
      })
    })
  }
}

class Output {
  readonly #writer: WriteStream;
  #indent: number = 0;

  constructor(writer: WriteStream) {
    this.#writer = writer;
  }

  #write(str: string): void {
    this.#writer.write(str);
  }

  #writeIndent(): void {
    for (let i = 0; i < this.#indent; i++) {
      this.#write('  ');
    }
  }

  writeFile(file: JsFile): void {
    file.declarations.forEach(dec => {
      if (dec instanceof JsImport) {
        this.#write('import { ');
        this.#write(dec.take);
        if (dec.as !== undefined) {
          this.#write(' as ');
          this.#write(dec.as);
        }
        this.#write(' } from "');
        if (dec.from === 'core/dom') {
          this.#write('../runtime/dom.ts');
        } else {
          this.#write(dec.from);
        }
        this.#write('";\n');
      } else if (dec instanceof JsStructDeclare) {
        this.#writeStruct(dec);
      } else if (dec instanceof JsTupleDeclare) {
        this.#writeTuple(dec);
      } else if (dec instanceof JsAtomDeclare) {
        this.#writeAtom(dec);
      } else if (dec instanceof JsEnumDeclare) {
        this.#write('const ');
        this.#write(dec.name);
        this.#write(' = {\n');
        dec.variants.forEach(v => {
          this.#write('  ');
          this.#write(v.name);
          this.#write(': ');

          if (v instanceof JsStructDeclare) {
            this.#writeStruct(v);
          } else if (v instanceof JsTupleDeclare) {
            this.#writeTuple(v);
          } else {
            this.#writeAtom(v);
          }

          this.#write(',\n');
        });
        this.#write('};\n');
      } else if (dec instanceof JsConst) {
        this.#write('const ');
        this.#write(dec.name);
        this.#write(' = ');
        this.#writeExpression(dec.body);
        this.#write(';\n');
      } else {
        if (dec.export) {
          this.#write('export ');
        }

        this.#writeFunctionStatement(dec.func);
      }
    });

    this.#write('_main(main, _domRenderer);\n');
  }

  #writeStruct(dec: JsStructDeclare): void {
    this.#write('class ');
    this.#write(dec.name);
    this.#write(' extends Record({\n');
    dec.fields.forEach(field => {
      this.#write('  ');
      this.#write(field);
      this.#write(': undefined,\n');
    });
    this.#write('}) {}');
  }

  #writeTuple(dec: JsTupleDeclare): void {
    this.#write('class ');
    this.#write(dec.name);
    this.#write(' extends Record({\n');
    dec.fields.forEach(field => {
      this.#write('  ');
      this.#write(field);
      this.#write(': undefined,\n');
    });
    this.#write('}) {},');
  }

  #writeAtom(dec: JsAtomDeclare): void {
    this.#write('new Symbol("');
    this.#write(dec.name);
    this.#write('")');
  }

  #writeExpression(ex: JsExpression): void {
    if (ex instanceof JsBooleanLiteralEx) {
      this.#write(ex.value ? 'true' : 'false');
    } else if (ex instanceof JsNumberLiteralEx) {
      this.#write(ex.value.toString(10));
    } else if (ex instanceof JsStringLiteralEx) {
      this.#write("'");
      // escape single quotes and newlines
      this.#write(ex.value.replaceAll("'", "\\'").replaceAll("\n", "\\n"));
      this.#write("'");
    } else if (ex instanceof JsIdentifierEx) {
      this.#write(ex.name);
    } else if (ex instanceof JsLambdaEx) {
      this.#write('(');
      ex.args.forEach(it => {
        this.#write(it);
        this.#write(', ');
      });
      this.#write(') => {\n');
      this.#indent++;
      ex.body.forEach(it => this.#writeStatement(it));
      this.#indent--;
      this.#write('}');
    } else if (ex instanceof JsSingleton) {
      this.#write('_singleton(');
      this.#writeExpression(ex.init);
      this.#write(')');
    } else if (ex instanceof JsVariable) {
      this.#write('_variable(');
      this.#writeExpression(ex.init);
      this.#write(')');
    } else if (ex instanceof JsProjection) {
      this.#write('_projection(');
      this.#writeExpression(ex.base);
      this.#write(', item => item.');
      this.#write(ex.property);
      this.#write(', (item, value) => item.set("');
      this.#write(ex.property);
      this.#write('", value))');
    } else if (ex instanceof JsFlow) {
      this.#write('_flow([');
      ex.args.forEach(it => this.#writeExpression(it));
      this.#write('], ');
      this.#writeExpression(ex.body);
      this.#write(')');
    } else if (ex instanceof JsDef) {
      this.#write('_def([');
      ex.args.forEach(it => this.#writeExpression(it));
      this.#write('], ');
      this.#writeExpression(ex.body);
      this.#write(')');
    } else if (ex instanceof JsFlowGet) {
      this.#writeExpression(ex.body);
      this.#write('.get()');
    } else if (ex instanceof JsUndefined) {
      this.#write('undefined');
    } else if (ex instanceof JsArray) {
      this.#write('[');
      ex.args.forEach(it => {
        this.#writeExpression(it)
        this.#write(', ');
      });
      this.#write(']');
    } else if (ex instanceof JsConstruct) {
      this.#write('new ');
      this.#writeExpression(ex.base);
      this.#write('({');
      ex.fields.forEach(field => {
        this.#write(field.name);
        this.#write(': ');
        this.#writeExpression(field.value);
        this.#write(', ');
      });
      this.#write('})');
    } else if (ex instanceof JsAccess) {
      this.#writeExpression(ex.base)
      this.#write('.');
      this.#write(ex.field);
    } else if (ex instanceof JsCall) {
      this.#writeExpression(ex.func);
      this.#write('(');
      ex.args.forEach(it => {
        this.#writeExpression(it);
        this.#write(', ');
      });
      this.#write(')');
    } else if (ex instanceof JsBinaryOp) {
      this.#write('(');
      this.#writeExpression(ex.left);
      this.#write(' ');
      this.#write(ex.op);
      this.#write(' ');
      this.#writeExpression(ex.right);
      this.#write(')');
    } else {
      this.#write(ex.op);
      this.#write('(');
      this.#writeExpression(ex.base);
      this.#write(')');
    }
  }

  #writeStatement(state: JsStatement): void {
    if (state instanceof JsDeclareVar) {
      this.#writeIndent();
      this.#write('var ');
      this.#write(state.name);
      this.#write(';\n');
    } else if (state instanceof JsAssign) {
      this.#writeIndent();
      this.#write('const ');
      this.#write(state.name);
      this.#write(' = ');
      this.#writeExpression(state.body);
      this.#write(';\n');
    } else if (state instanceof JsReassign) {
      this.#writeIndent();
      this.#write(state.name);
      this.#write('.set(');
      this.#writeExpression(state.body);
      this.#write(');\n');
    } else if (state instanceof JsFunctionStatement) {
      this.#writeFunctionStatement(state);
    } else if (state instanceof JsReturn) {
      this.#writeIndent();
      this.#write('return ');
      this.#writeExpression(state.body);
      this.#write(';\n');
    } else if (state instanceof JsIf) {
      this.#writeIndent();
      this.#write('if (');
      this.#writeExpression(state.condition);
      this.#write(') {\n');
      this.#indent++;
      state.thenBlock.forEach(it => this.#writeStatement(it));
      this.#indent--;
      this.#writeIndent();
      this.#write('} else {');
      this.#indent++;
      state.elseBlock.forEach(it => this.#writeStatement(it));
      this.#indent--;
      this.#writeIndent();
      this.#write('}\n');
    } else {
      this.#writeIndent();
      this.#writeExpression(state.base);
      this.#write(';\n');
    }
  }

  #writeFunctionStatement(state: JsFunctionStatement): void {
    this.#writeIndent();
    this.#write('function ');
    this.#write(state.name);
    this.#write(' (');
    state.args.forEach(arg => {
      this.#write(arg);
      this.#write(', ');
    });
    this.#write(') {\n');
    this.#indent++;
    state.body.forEach(it => this.#writeStatement(it));
    this.#indent--;
    this.#writeIndent();
    this.#write('}\n');
  }
}
