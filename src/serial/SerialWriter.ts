import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import {
  CheckedAccessRecord,
  CheckedAtomType,
  CheckedConstantDeclare,
  CheckedDataDeclare,
  type CheckedDataLayoutType,
  type CheckedDeclaration,
  CheckedEnumDeclare,
  CheckedEnumType,
  CheckedFile,
  CheckedFunctionDeclare,
  CheckedFunctionExternDeclare, CheckedFunctionStatement,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedImportDeclaration, type CheckedImportExpression, CheckedLambdaEx,
  CheckedModuleType, CheckedNestedImportExpression, CheckedNominalImportExpression,
  CheckedNominalType,
  CheckedOverloadFunctionType,
  CheckedPackage,
  CheckedParameterizedType,
  CheckedStructType,
  CheckedTupleType,
  type CheckedTypeExpression,
  CheckedTypeParameterType
} from '../checker/checkerAst.ts';
import { createGzip } from 'node:zlib';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { PackageName, Position, Symbol, Version } from '../ast.js';
import { Map } from 'immutable';

export class SerialWriter {
  readonly #writeStream: Writable;

  constructor(writeStream: Writable) {
    this.#writeStream = writeStream;
  }

  static async writePackage(pack: CheckedPackage, dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir);
    }

    const rawOut = createWriteStream(`${dir}/${pack.name.name}.thermlib`, {encoding: 'utf-8'});

    const zip = createGzip();

    zip.pipe(rawOut);

    new SerialWriter(zip).#writePackage(pack);

    // maybe close and then finished?
    zip.close();
    await finished(zip);
  }

  #writePackage(pack: CheckedPackage): void {
    const name = pack.name;

    new ObjectOutput(this.#writeStream, undefined as unknown as Output)
      .startObject('compiler')
      .number('version', 1) // TODO: extend this with more additional compiler information
      .endObject()

      .object('name', this.#writePackageName(name))
      .array('declarations', this.#writeAccessRecords(pack.declarations))
      .arrayOfObjects('files', pack.files, this.#writeFile)
      .endObject();
  }

  #writeFile(file: CheckedFile): (output: ObjectOutput<any>) => void {
    return output => {
      output.string('src', file.src)
        .object('module', this.#writeSymbol(file.module))
        .arrayOfObjects('declarations', file.declarations, this.#writeDeclaration);
    };
  }

  #writeDeclaration(dec: CheckedDeclaration): (output: ObjectOutput<any>) => void {
    return output => {
      if (dec instanceof CheckedImportDeclaration) {
        output.string('kind', 'ImportDeclaration').object('value', this.#writeImportDeclaration(dec));
      } else if (dec instanceof CheckedFunctionDeclare) {
        output.string('kind', 'FunctionDeclare').object('value', this.#writeFunctionDeclare(dec));
      } else if (dec instanceof CheckedFunctionExternDeclare) {
        output.string('kind', 'FunctionExternDeclare').object('value', this.#writeFunctionExternDeclare(dec));
      } else if (dec instanceof CheckedDataDeclare) {
        output.string('kind', 'DataDeclare').object('value', this.#writeDataDeclare(dec));
      } else if (dec instanceof CheckedEnumDeclare) {
        output.string('kind', 'EnumDeclare').object('value', this.#writeEnumDeclare(dec));
      } else if (dec instanceof CheckedConstantDeclare) {
        output.string('kind', 'ConstantDeclare').object('value', this.#writeConstantDeclare(dec));
      }
    };
  }

  #writeImportDeclaration(dec: CheckedImportDeclaration): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(dec.pos))
        .object('package', this.#writeNominalImportExpression(dec.package))
        .object('ex', this.#writeImportExpression(dec.ex));
    };
  }

  #writeNominalImportExpression(dec: CheckedNominalImportExpression): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(dec.pos))
        .string('name', dec.name);
    };
  }

  #writeImportExpression(dec: CheckedImportExpression): (output: ObjectOutput<any>) => void {
    return output => {
      if (dec instanceof CheckedNominalImportExpression) {
        output.string('kind', 'NominalImportExpression').object('value', this.#writeNominalImportExpression(dec));
      } else {
        output.string('kind', 'NestedImportExpression').object('value', this.#writeNestedImportExpression(dec));
      }
    };
  }

  #writeNestedImportExpression(dec: CheckedNestedImportExpression): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(dec.pos))
        .object('base', this.#writeNominalImportExpression(dec.base))
        .arrayOfObjects('children', dec.children, this.#writeImportExpression);
    };
  }


  #writeFunctionDeclare(dec: CheckedFunctionDeclare): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(dec.pos))
        .string('access', dec.access)
        .object('symbol', this.#writeSymbol(dec.symbol))
        .object('func', this.#writeFunctionStatement(dec.func));
    };
  }

  #writeFunctionStatement(dec: CheckedFunctionStatement): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(dec.pos))
        .string('phase', dec.phase)
        .string('name', dec.name)
        .arrayOfObjects('typeParams', dec.typeParams, this.#writeTypeParameterType)
        .object('result', this.#writeTypeExpression(dec.result))
        .object('lambda', this.#writeLambda(dec.lambda))
        .object('type', this.#writeTypeExpression(dec.type));
    };
  }

  #writeLambda(dec: CheckedLambdaEx): (output: ObjectOutput<any>) => void {
    return output => {

    };
  }

  #writeFunctionExternDeclare(dec: CheckedFunctionExternDeclare): (output: ObjectOutput<any>) => void {
    return output => {

    };
  }

  #writeDataDeclare(dec: CheckedDataDeclare): (output: ObjectOutput<any>) => void {
    return output => {

    };
  }

  #writeEnumDeclare(dec: CheckedEnumDeclare): (output: ObjectOutput<any>) => void {
    return output => {

    };
  }

  #writeConstantDeclare(dec: CheckedConstantDeclare): (output: ObjectOutput<any>) => void {
    return output => {

    };
  }

  #writeAccessRecords(decs: Map<Symbol, CheckedAccessRecord>): (output: ArrayOutput<any>) => void {
    return output => {
      decs.valueSeq().forEach(record => {
        output.startObject()
          .string('access', record.access)
          .array('path', arr => {
            record.module.path.forEach(step => {
              arr.string(step);
            });
          })
          .object('type', this.#writeTypeExpression(record.type))
          .endObject();
      });
    };
  }

  #writeTypeExpression(ex: CheckedTypeExpression): (output: ObjectOutput<any>) => void {
    return output => {
      if (ex instanceof CheckedNominalType) {
        output.string('kind', 'NominalType').object('value', this.#writeNominalType(ex));
      } else if (ex instanceof CheckedParameterizedType) {
        output.string('kind', 'ParameterizedType').object('value', this.#writeParameterizedType(ex));
      } else if (ex instanceof CheckedFunctionTypeParameter) {
        output.string('kind', 'FunctionTypeParameter').object('value', this.#writeFunctionTypeParameter(ex));
      } else if (ex instanceof CheckedTypeParameterType) {
        output.string('kind', 'TypeParameterType').object('value', this.#writeTypeParameterType(ex));
      } else if (ex instanceof CheckedFunctionType) {
        output.string('kind', 'FunctionType').object('value', this.#writeFunctionType(ex));
      } else if (ex instanceof CheckedOverloadFunctionType) {
        output.string('kind', 'OverloadFunctionType').object('value', this.#writeOverloadFunctionType(ex));
      } else if (ex instanceof CheckedModuleType) {
        output.string('kind', 'ModuleType').object('value', this.#writeModuleType(ex));
      } else if (ex instanceof CheckedStructType) {
        output.string('kind', 'StructType').object('value', this.#writeStructType(ex));
      } else if (ex instanceof CheckedTupleType) {
        output.string('kind', 'TupleType').object('value', this.#writeTupleType(ex));
      } else if (ex instanceof CheckedAtomType) {
        output.string('kind', 'AtomType').object('value', this.#writeAtomType(ex));
      } else if (ex instanceof CheckedEnumType) {
        output.string('kind', 'EnumType').object('value', this.#writeEnumType(ex));
      }
    };
  }

  #writeNominalType(ex: CheckedNominalType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('name', this.#writeSymbol(ex.name));
    };
  }

  #writeParameterizedType(ex: CheckedParameterizedType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('base', this.#writeNominalType(ex.base))
        .arrayOfObjects('args', ex.args, this.#writeTypeExpression);
    };
  }

  #writeFunctionTypeParameter(ex: CheckedFunctionTypeParameter): (output: ObjectOutput<any>) => void {
    return output => {
      output.string('phase', ex.phase)
        .object('type', this.#writeTypeExpression(ex.type));
    };
  }

  #writeTypeParameterType(ex: CheckedTypeParameterType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('name', this.#writeSymbol(ex.name));
    };
  }

  #writeFunctionType(ex: CheckedFunctionType): (output: ObjectOutput<any>) => void {
    return output => {
      output.string('phase', ex.phase)
        .arrayOfObjects('typeParams', ex.typeParams, this.#writeTypeParameterType)
        .arrayOfObjects('params', ex.params, this.#writeFunctionTypeParameter)
        .object('result', this.#writeTypeExpression(ex.result));
    };
  }

  #writeOverloadFunctionType(ex: CheckedOverloadFunctionType): (output: ObjectOutput<any>) => void {
    return output => {
      output.arrayOfObjects('branches', ex.branches, this.#writeFunctionType);
    };
  }

  #writeModuleType(ex: CheckedModuleType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('name', this.#writeSymbol(ex.name));
    };
  }

  #writeDataLayoutType(ex: CheckedDataLayoutType): (output: ObjectOutput<any>) => void {
    return output => {

      if (ex instanceof CheckedStructType) {
        output.string('kind', 'StructType').object('value', this.#writeStructType(ex));
      } else if (ex instanceof CheckedTupleType) {
        output.string('kind', 'TupleType').object('value', this.#writeTupleType(ex));
      } else if (ex instanceof CheckedAtomType) {
        output.string('kind', 'AtomType').object('value', this.#writeAtomType(ex));
      }
    };
  }

  #writeEnumType(ex: CheckedEnumType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(ex.pos))
        .object('name', this.#writeSymbol(ex.name))
        .arrayOfObjects('typeParams', ex.typeParams, this.#writeTypeParameterType)
        .object('variants', obj => {
          for (const [key, value] of ex.variants) {
            obj.object(key, this.#writeDataLayoutType(value));
          }
        });
    };
  }

  #writeStructType(ex: CheckedStructType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(ex.pos))
        .object('name', this.#writeSymbol(ex.name))
        .arrayOfObjects('typeParams', ex.typeParams, this.#writeTypeParameterType)
        .object('fields', obj => {
          for (const [key, value] of ex.fields) {
            obj.object(key, this.#writeTypeExpression(value));
          }
        });

      if (ex.enum !== undefined) {
        output.object('enum', this.#writeSymbol(ex.enum));
      }
    };
  }

  #writeTupleType(ex: CheckedTupleType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(ex.pos))
        .object('name', this.#writeSymbol(ex.name))
        .arrayOfObjects('typeParams', ex.typeParams, this.#writeTypeParameterType)
        .arrayOfObjects('fields', ex.fields, this.#writeTypeExpression);

      if (ex.enum !== undefined) {
        output.object('enum', this.#writeSymbol(ex.enum));
      }
    };
  }

  #writeAtomType(ex: CheckedAtomType): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('pos', this.#writePosition(ex.pos))
        .object('name', this.#writeSymbol(ex.name))
        .arrayOfObjects('typeParams', ex.typeParams, this.#writeTypeParameterType);

      if (ex.enum !== undefined) {
        output.object('enum', this.#writeSymbol(ex.enum));
      }
    };
  }

  #writePosition(pos: Position): (output: ObjectOutput<any>) => void {
    return output => {
      output.string('src', pos.src)
        .number('line', pos.line)
        .number('column', pos.column);
    };
  }

  #writeSymbol(symbol: Symbol): (output: ObjectOutput<any>) => void {
    return output => {
      output.object('package', this.#writePackageName(symbol.package))
        .array('path', out => symbol.path.forEach(it => out.string(it)));
    };
  }

  #writePackageName(packageName: PackageName): (output: ObjectOutput<any>) => void {
    return output => {
      output.string('organization', packageName.organization)
        .string('assembly', packageName.assembly)
        .string('name', packageName.name)
        .object('version', this.#writeVersion(packageName.version));
    };
  }

  #writeVersion(version: Version): (output: ObjectOutput<any>) => void {
    return output => {
      output
        .number('major', version.major)
        .number('minor', version.minor)
        .number('patch', version.patch)
        .number('build', version.build)
        .string('channel', version.channel)
        .string('variant', version.variant);
    };
  }

}

export type Output = ObjectOutput<Output> | ArrayOutput<Output>;

export class ObjectOutput<Parent extends Output> {
  readonly #writeStream: Writable;
  readonly #parent: Parent;
  #first = true;

  constructor(writeStream: Writable, parent: Parent) {
    this.#writeStream = writeStream;
    this.#parent = parent;
    this.#write('{');
  }

  #write(text: string): void {
    this.#writeStream.write(text);
  }

  #writeString(str: string): void {
    this.#write('"');
    this.#write(str);
    this.#write('"');
  }

  string(key: string, str: string | undefined): this {
    if (str !== undefined) {
      this.#writeEntry(key);
      this.#writeString(str);
    }
    return this;
  }

  number(key: string, num: number | undefined): this {
    if (num !== undefined) {
      this.#writeEntry(key);
      this.#write(String(num));
    }
    return this;
  }

  boolean(key: string, bool: boolean | undefined): this {
    if (bool !== undefined) {
      this.#writeEntry(key);
      if (bool) {
        this.#write('true');
      } else {
        this.#write('false');
      }
    }
    return this;
  }

  #writeEntry(key: string): void {
    if (!this.#first) {
      this.#write(',');
    }
    this.#writeString(key);
    this.#write(':');
    this.#first = false;
  }

  startArray(key: string): ArrayOutput<this> {
    this.#writeEntry(key);
    return new ArrayOutput<this>(this.#writeStream, this);
  }

  startObject(key: string): ObjectOutput<this> {
    this.#writeEntry(key);
    return new ObjectOutput<this>(this.#writeStream, this);
  }

  endObject(): Parent {
    this.#write('}');
    return this.#parent;
  }

  object(key: string, generator: (out: ObjectOutput<this>) => void): this {
    const started = this.startObject(key);
    generator(started);
    started.endObject();
    return this;
  }

  array(key: string, generator: (out: ArrayOutput<this>) => void): this {
    const started = this.startArray(key);
    generator(started);
    started.endArray();
    return this;
  }

  arrayOfObjects<Item>(key: string, items: Iterable<Item>, generator: (item: Item) => (out: ObjectOutput<ArrayOutput<this>>) => void): this {
    this.array('key', arr => {
      for (const next of items) {
        arr.object(generator(next));
      }
    });

    return this;
  }
}

export class ArrayOutput<Parent extends Output> {
  readonly #writeStream: Writable;
  readonly #parent: Parent;
  #first = true;

  constructor(writeStream: Writable, parent: Parent) {
    this.#writeStream = writeStream;
    this.#parent = parent;
    this.#write('[');
  }

  #write(text: string): void {
    this.#writeStream.write(text);
  }

  string(str: string | undefined): this {
    if (str !== undefined) {
      this.#writeEntry();
      this.#write('"');
      this.#write(str);
      this.#write('"');
    }
    return this;
  }

  number(num: number | undefined): this {
    if (num !== undefined) {
      this.#writeEntry();
      this.#write(String(num));
    }
    return this;
  }

  boolean(bool: boolean): this {
    if (bool !== undefined) {
      this.#writeEntry();
      if (bool) {
        this.#write('true');
      } else {
        this.#write('false');
      }
    }
    return this;
  }

  #writeEntry(): void {
    if (!this.#first) {
      this.#write(',');
    }
    this.#first = false;
  }

  startArray(): ArrayOutput<this> {
    this.#writeEntry();
    return new ArrayOutput<this>(this.#writeStream, this);
  }

  startObject(): ObjectOutput<this> {
    this.#writeEntry();
    return new ObjectOutput<this>(this.#writeStream, this);
  }

  endArray(): Parent {
    this.#write(']');
    return this.#parent;
  }

  object(generator: (out: ObjectOutput<this>) => void): this {
    const started = this.startObject();
    generator(started);
    started.endObject();
    return this;
  }

  array(generator: (out: ArrayOutput<this>) => void): this {
    const started = this.startArray();
    generator(started);
    started.endArray();
    return this;
  }
}
