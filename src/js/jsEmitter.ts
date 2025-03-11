import {
  JsAccess,
  JsArray,
  JsAssign,
  JsAtomLayout,
  JsBinaryOp,
  JsBooleanLiteralEx,
  JsCall,
  JsConst,
  JsConstruct,
  JsDataDeclare,
  type JsDataLayout,
  JsDeclareVar,
  JsDef,
  JsEnumDeclare,
  JsExport,
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
  JsStructLayout,
  JsTupleLayout,
  JsUndefined,
  JsVariable
} from './jsIr.ts';
import { createWriteStream, existsSync, mkdirSync, WriteStream } from 'node:fs';

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
      } else if (dec instanceof JsExport) {
        this.#write('export { ');
        this.#write(dec.name);
        this.#write(' };\n');
      } else if (dec instanceof JsDataDeclare) {
        if (dec.export) {
          this.#write('export ');
        }
        this.#write('const ');
        this.#write(dec.layout.name);
        this.#write(' = ');
        this.#writeDataLayout(dec.layout);
        this.#write(';\n');
      } else if (dec instanceof JsEnumDeclare) {
        if (dec.export) {
          this.#write('export ');
        }
        this.#write('const ');
        this.#write(dec.name);
        this.#write(' = {\n');
        dec.variants.forEach(v => {
          this.#write('  ');
          this.#write(v.name);
          this.#write(': ');
          this.#writeDataLayout(v);
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

    if (file.main) {
      this.#write('_main(main, _domRenderer);\n');
    }
  }

  #writeDataLayout(layout: JsDataLayout): void {
    if (layout instanceof JsStructLayout) {
      this.#writeStruct(layout);
    } else if (layout instanceof JsTupleLayout) {
      this.#writeTuple(layout);
    } else {
      this.#writeAtom(layout);
    }
  }

  #writeStruct(dec: JsStructLayout): void {
    this.#write('{\n');
    this.#write('  [_thermalClassMarker]: true,\n');
    this.#write('  fullName: "');
    this.#write(dec.name); // TODO: include full name with package and version and everything
    this.#write('",\n');
    this.#write('  name: "');
    this.#write(dec.name);
    this.#write('",\n');
    this.#write('  generics: [],\n'); // TODO pass generics down to this point
    this.#write('  type: "struct",\n');
    this.#write('  enum: undefined,\n'); // TODO: pass enum value to this point
    this.#write('  fields: {\n');
    dec.fields.forEach(field => {
      this.#write('    ');
      this.#write(field);
      this.#write(': undefined,\n'); // TODO: pass field info down to this point
    });
    this.#write('  },\n}');
  }

  #writeTuple(dec: JsTupleLayout): void {
    this.#write('{\n');
    this.#write('  [_thermalClassMarker]: true,\n');
    this.#write('  fullName: "');
    this.#write(dec.name); // TODO: include full name with package and version and everything
    this.#write('",\n');
    this.#write('  name: "');
    this.#write(dec.name);
    this.#write('",\n');
    this.#write('  generics: [],\n'); // TODO pass generics down to this point
    this.#write('  type: "tuple",\n');
    this.#write('  enum: undefined,\n'); // TODO: pass enum value to this point
    this.#write('  fields: {\n');
    dec.fields.forEach(field => {
      this.#write('    ');
      this.#write(field);
      this.#write(': undefined,\n'); // TODO: pass field info down to this point
    });
    this.#write('  },\n}');
  }

  #writeAtom(dec: JsAtomLayout): void {
    this.#write('{\n');
    this.#write('  [_thermalClassMarker]: true,\n');
    this.#write('  fullName: "');
    this.#write(dec.name); // TODO: include full name with package and version and everything
    this.#write('",\n');
    this.#write('  name: "');
    this.#write(dec.name);
    this.#write('",\n');
    this.#write('  generics: [],\n'); // TODO pass generics down to this point
    this.#write('  type: "atom",\n');
    this.#write('  enum: undefined,\n'); // TODO: pass enum value to this point
    this.#write('  fields: {\n  },\n}');
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
      this.#write(', (item, value) => ({...item, ');
      this.#write(ex.property);
      this.#write(': value}))');
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
      this.#write('{ [_thermalClass]: ');
      this.#writeExpression(ex.base);
      this.#write(', ');
      ex.fields.forEach(field => {
        this.#write(field.name);
        this.#write(': ');
        this.#writeExpression(field.value);
        this.#write(', ');
      });
      this.#write('}');
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
      this.#writeExpression(state.name);
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
