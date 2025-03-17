import {
  CheckedAccessEx,
  CheckedAndEx,
  CheckedAssignmentStatement,
  CheckedBlockEx,
  CheckedBooleanLiteralEx,
  CheckedCallEx,
  CheckedConstantDeclare,
  CheckedConstructEx,
  CheckedDataDeclare,
  type CheckedDataLayout,
  type CheckedExpression,
  CheckedExpressionStatement,
  type CheckedFile,
  CheckedFloatLiteralEx,
  type CheckedFunction,
  CheckedFunctionDeclare,
  CheckedFunctionType,
  CheckedIdentifierEx,
  CheckedIfEx,
  CheckedImplDeclare,
  CheckedImportDeclaration,
  type CheckedImportExpression,
  CheckedIntLiteralEx,
  CheckedIsEx,
  CheckedLambdaEx,
  CheckedListLiteralEx,
  CheckedMapLiteralEntry,
  CheckedMapLiteralEx,
  CheckedNominalImportExpression,
  CheckedNominalType,
  CheckedNoOpEx,
  CheckedNotEx,
  CheckedOrEx,
  CheckedReassignmentStatement,
  CheckedReturnEx,
  CheckedSetLiteralEx,
  type CheckedStatement,
  CheckedStaticAccessEx,
  CheckedStaticReferenceEx,
  CheckedStringLiteralEx,
  CheckedStruct,
  CheckedTuple,
  CheckedTupleType
} from '../checker/checkerAst.ts';
import {
  JsAccess,
  JsArray,
  JsAssign,
  JsAtomLayout,
  JsBinaryOp,
  JsBlock,
  JsBooleanLiteralEx,
  JsCall,
  JsConst,
  JsConstruct,
  JsConstructField,
  JsDataDeclare,
  type JsDataLayout,
  type JsDeclaration,
  JsDeclareVar,
  JsEnumDeclare,
  JsExport,
  type JsExpression,
  JsExpressionStatement,
  JsFile,
  JsFlowGet,
  JsFunctionDeclare,
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
  JsUnaryOp,
  JsUndefined
} from './jsIr.ts';
import { List, Map, Seq } from 'immutable';
import { type ExpressionPhase, type FunctionPhase, Position, type Symbol } from '../ast.ts';
import { Extern } from '../ast.ts';
import { substringAfterLast } from '../utils.ts';

export class JsCompiler {

  #nextTempId = 0;
  #defaultImports = List.of('thermalClass', 'thermalClassMarker', 'is', 'equals', 'hashCode').map(take => {
    return new JsImport({
      from: '../runtime/reflect.ts',
      take,
      as: `_${take}`,
    });
  }).concat(List.of(
    new JsImport({
      from: '../lib/core/vector.ts',
      take: 'from',
      as: '_Vec_from',
    }),
    new JsImport({
      from: '../lib/core/map.ts',
      take: 'from',
      as: '_Map_from',
    }),
    // new JsImport({
    //   from: '../runtime/reflect.ts',
    //   take: 'List',
    //   as: undefined,
    // }),
    // new JsImport({
    //   from: '../runtime/reflect.ts',
    //   take: 'HashMap',
    //   as: 'Map',
    // }),
    // new JsImport({
    //   from: '../runtime/reflect.ts',
    //   take: 'HashSet',
    //   as: 'Set',
    // }),
    new JsImport({
      from: '../runtime/reflect.ts',
      take: 'stringConcat',
      as: undefined,
    }),
  )).concat(List.of('singleton', 'variable', 'projection', 'flow', 'def', 'main').map(take => {
    return new JsImport({
      from: '../runtime/runtime.ts',
      take,
      as: `_${take}`,
    });
  })).push(
    new JsImport({
      from: '../runtime/runtime.ts',
      take: 'effect',
      as: undefined,
    }),
    new JsImport({
      from: '../runtime/dom.ts',
      take: 'domRenderer',
      as: '_domRenderer',
    }),
  );

  compileFile(src: CheckedFile, externals: Map<Symbol, Extern>): JsFile {
    const staticImportReferences = src.declarations.toSeq()
      .flatMap(dec => {
        if (dec instanceof CheckedImportDeclaration) {
          return Seq.Indexed<CheckedStaticReferenceEx>();
        } else if (dec instanceof CheckedConstantDeclare) {
          return this.#seekStaticReferences(dec.expression);
        } else if (dec instanceof CheckedFunctionDeclare) {
          return this.#seekStaticReferences(dec.body);
        } else if (dec instanceof CheckedDataDeclare) {
          return Seq.Indexed<CheckedStaticReferenceEx>();
        } else if (dec instanceof CheckedImplDeclare) {
          return dec.methods.valueSeq().flatMap(funcDec => this.#seekStaticReferences(funcDec.body));
        } else {
          // enum
          return Seq.Indexed<CheckedStaticReferenceEx>();
        }
      }).groupBy(it => it.module)
      .remove(src.module) // don't import from yourself!
      .entrySeq()
      .flatMap(([module, list]) => {
        return list.toSeq().map(it => it.symbol.serializedName()).toSet()
          .map(path => {
            return new JsImport({
              from: `./${module.name}.js`,
              take: path,
              as: path,
            })
          })
      }).toList();

    const decs = src.declarations.flatMap<JsDeclaration>(dec => {
      if (dec instanceof CheckedImportDeclaration) {
        return Seq(this.#deconstructImport('.', dec.ex));
      } else if (dec instanceof CheckedConstantDeclare) {
        if (dec.extern) {
          return this.#importExternal(dec.name, dec.pos, dec.symbol, dec.access === 'private', externals);
        } else {
          const value = this.#compileExpression(dec.expression, 'fun');

          if (value instanceof JsBlock) {
            return Seq.Indexed.of(new JsConst({
              name: dec.name,
              export: dec.access !== 'private',
              body: new JsCall({
                func: new JsLambdaEx({
                  args: List(),
                  body: value.body.push(new JsReturn({ body: value.result })),
                }),
                args: List(),
              })
            }));
          } else {
            return Seq.Indexed.of(new JsConst({
              name: dec.name,
              export: dec.access !== 'private',
              body: value,
            }))
          }
        }
      } else if (dec instanceof CheckedFunctionDeclare) {
        if (dec.extern) {
          return this.#importExternal(dec.name, dec.pos, dec.symbol, dec.access === 'private', externals);
        } else {
          return Seq.Indexed.of(new JsFunctionDeclare({
            export: dec.access !== 'private',
            func: this.#compileFunctionStatement(dec),
          }));
        }
      } else if (dec instanceof CheckedDataDeclare) {
        return Seq.Indexed.of(new JsDataDeclare({
          export: dec.access !== 'private',
          layout: this.#compileDataLayout(dec.name, dec.layout),
        }));
      } else if (dec instanceof CheckedImplDeclare) {
        const prefix = dec.symbol.serializedName();

        return dec.methods.valueSeq()
          .flatMap(funcDec => {
            if (funcDec.extern) {
              const ex = externals.get(funcDec.symbol);

              if (ex === undefined) {
                return dec.pos.fail(`No externally defined implementation was found for ${funcDec.symbol}`);
              }

              const importDec = new JsImport({
                from: ex.srcFile,
                take: ex.import,
                as: `${prefix}_${funcDec.name}`,
              });

              if (funcDec.access === 'private') {
                return Seq.Indexed.of(importDec);
              } else {
                return Seq.Indexed.of<JsDeclaration>(
                  importDec,
                  new JsExport({
                    name: `${prefix}_${funcDec.name}`,
                  }),
                )
              }
            } else {
              return Seq.Indexed.of(new JsFunctionDeclare({
                export: funcDec.access !== 'private',
                func: this.#compileFunctionStatement(funcDec.update('name', base => `${prefix}_${base}`)),
              }));
            }
          });
      } else {
        return Seq.Indexed.of(new JsEnumDeclare({
          export: dec.access !== 'private',
          name: dec.name,
          symbol: dec.symbol,
          variants: dec.variants.entrySeq().map(([name, variant]) => {
            return this.#compileDataLayout(name, variant);
          }).toList(),
        }))
      }
    });

    return new JsFile({
      name: substringAfterLast(src.src, '/').replace(/\.thermal$/, '.js'),
      main: src.declarations.some(dec => dec instanceof CheckedFunctionDeclare && dec.name === 'main'),
      declarations: this.#defaultImports.concat(staticImportReferences, decs),
    })
  }

  #importExternal(name: string, pos: Position, symbol: Symbol, isPrivate: boolean, externals: Map<Symbol, Extern>): Seq.Indexed<JsDeclaration> {
    const ex = externals.get(symbol);

    if (ex === undefined) {
      return pos.fail(`No externally defined implementation was found for ${symbol}`);
    }

    const importDec = new JsImport({
      from: ex.srcFile,
      take: ex.import,
      as: name,
    });

    if (isPrivate) {
      return Seq.Indexed.of(importDec);
    } else {
      return Seq.Indexed.of<JsDeclaration>(
        importDec,
        new JsExport({
          name: name,
        }),
      )
    }
  }

  /**
   * Recursively seek out static symbol imports
   */
  #seekStaticReferences(ex: CheckedExpression): Seq.Indexed<CheckedStaticReferenceEx> {
    if (ex instanceof CheckedBooleanLiteralEx) {
      return Seq.Indexed.of();
    } else if (ex instanceof CheckedIntLiteralEx) {
      return Seq.Indexed.of();
    } else if (ex instanceof CheckedFloatLiteralEx) {
      return Seq.Indexed.of();
    } else if (ex instanceof CheckedStringLiteralEx) {
      return Seq.Indexed.of();
    } else if (ex instanceof CheckedIdentifierEx) {
      return Seq.Indexed.of();
    } else if (ex instanceof CheckedListLiteralEx) {
      return ex.values.toSeq().flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedSetLiteralEx) {
      return ex.values.toSeq().flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedMapLiteralEx) {
      return ex.values.toSeq().flatMap(entry => {
        return Seq.Indexed.of(entry.key, entry.value)
          .flatMap(it => this.#seekStaticReferences(it));
      });
    } else if (ex instanceof CheckedIsEx) {
      return this.#seekStaticReferences(ex.base);
    } else if (ex instanceof CheckedNotEx) {
      return this.#seekStaticReferences(ex.base);
    } else if (ex instanceof CheckedOrEx) {
      return Seq.Indexed.of(ex.left, ex.right)
        .flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedAndEx) {
      return Seq.Indexed.of(ex.left, ex.right)
        .flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedAccessEx) {
      return this.#seekStaticReferences(ex.base);
    } else if (ex instanceof CheckedStaticAccessEx) {
      return ex.path.toSeq().flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedStaticReferenceEx) {
      return Seq.Indexed.of(ex);
    } else if (ex instanceof CheckedConstructEx) {
      return Seq.Indexed.of(ex.base).concat(ex.fields.toSeq().map(it => it.value))
        .flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedLambdaEx) {
      return this.#seekStaticReferences(ex.body);
    } else if (ex instanceof CheckedBlockEx) {
      return ex.body.toSeq()
        .map<CheckedExpression>(state => {
          if (state instanceof CheckedExpressionStatement) {
            return state.expression;
          } else if (state instanceof CheckedAssignmentStatement) {
            return state.expression;
          } else if (state instanceof CheckedReassignmentStatement) {
            return state.expression;
          } else {
            return state.body;
          }
        }).flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedCallEx) {
      return ex.args.push(ex.func).toSeq().flatMap(it => this.#seekStaticReferences(it));
    } else if (ex instanceof CheckedIfEx) {
      return Seq.Indexed.of(ex.condition, ex.thenEx, ex.elseEx)
        .flatMap(it => {
          if (it === undefined) {
            return Seq.Indexed.of();
          } else {
            return this.#seekStaticReferences(it);
          }
        });
    } else if (ex instanceof CheckedNoOpEx) {
      return Seq.Indexed();
    } else {
      return this.#seekStaticReferences(ex.base);
    }
  }

  #compileDataLayout(name: string, variant: CheckedDataLayout): JsDataLayout {
    if (variant instanceof CheckedStruct) {
      return new JsStructLayout({
        name,
        symbol: variant.symbol,
        fields: variant.fields.keySeq().toSet(),
      });
    } else if (variant instanceof CheckedTuple) {
      return new JsTupleLayout({
        name,
        symbol: variant.symbol,
        fields: variant.fields.map((_, index) => `$${index}`).toList(),
      });
    } else {
      return new JsAtomLayout({
        name,
        symbol: variant.symbol,
      })
    }
  }

  #nextId(): string {
    return `$${this.#nextTempId++}`
  }

  *#deconstructImport(base: string, ex: CheckedImportExpression): IterableIterator<JsImport> {
    if (ex instanceof CheckedNominalImportExpression) {
      yield new JsImport({
        from: base + '.js',
        take: ex.name,
        as: undefined,
      });
    } else {
      for (const it of ex.children) {
        yield* this.#deconstructImport(base + '/' + ex.base.name, it);
      }
    }
  }

  /**
   * Any given expression can be compiled to just one expression or it can't and must be a series of statements
   *
   * If one of your sub-expressions returns a JsBlock then you too must return a JsBlock
   *
   * JsBlock is just a holder for a list of expressions
   */
  #compileExpression(ex: CheckedExpression, phase: FunctionPhase): JsBlock | JsExpression {
    if (ex instanceof CheckedBooleanLiteralEx) {
      return new JsBooleanLiteralEx({ value: ex.value });
    } else if (ex instanceof CheckedIntLiteralEx || ex instanceof CheckedFloatLiteralEx) {
      return new JsNumberLiteralEx({ value: ex.value });
    } else if (ex instanceof CheckedStringLiteralEx) {
      return new JsStringLiteralEx({ value: ex.value });
    } else if (ex instanceof CheckedIdentifierEx) {
      return new JsIdentifierEx({ name: ex.name });
    } else if (ex instanceof CheckedListLiteralEx) {
      return this.#handleListSetLiteral(new JsIdentifierEx({ name: '_Vec_from' }), phase, ex.values);
    } else if (ex instanceof CheckedSetLiteralEx) {
      return this.#handleListSetLiteral(new JsAccess({ base: new JsIdentifierEx({ name: 'Set' }), field: 'of' }), phase, ex.values);
    } else if (ex instanceof CheckedMapLiteralEx) {
      return this.#handleMapLiteral(new JsIdentifierEx({ name: '_Map_from' }), phase, ex.values);
    } else if (ex instanceof CheckedIsEx) {
      if (ex.type instanceof CheckedNominalType) {
        const typeEx = new CheckedIdentifierEx({ pos: ex.pos, name: ex.type.name.name, type: ex.type, phase: 'const' });

        return this.#handleAction(phase, 'fun', List.of(undefined, undefined), List.of(ex.base, typeEx), args => {
          return new JsCall({
            func: new JsIdentifierEx({name: 'is'}),
            args,
          });
        });
      } else {
        return ex.pos.fail('Can only handle basic type checks right now');
      }
    } else if (ex instanceof CheckedNotEx) {
      return this.#handleUnaryOp('!', phase, ex.base);
    } else if (ex instanceof CheckedOrEx) {
      return this.#handleBinaryOp('||', phase, ex.left, ex.right);
    } else if (ex instanceof CheckedAndEx) {
      return this.#handleBinaryOp('&&', phase, ex.left, ex.right);
    } else if (ex instanceof CheckedAccessEx) {
      return this.#use(this.#compileExpression(ex.base, phase), base => {
        if (ex.base.phase === 'var') {
          return new JsProjection({
            base,
            property: ex.field.name,
          })
        } else {
          return new JsAccess({
            base,
            field: ex.field.name,
          });
        }
      });
    } else if (ex instanceof CheckedStaticAccessEx) {
      return ex.path.reduce<JsExpression | undefined>((prev, next) => {
        if (prev === undefined) {
          return new JsIdentifierEx({ name: next.name });
        } else {
          return new JsAccess({
            base: prev,
            field: next.name,
          });
        }
      }, undefined)!;
    } else if (ex instanceof CheckedStaticReferenceEx) {
      return new JsIdentifierEx({ name: ex.symbol.serializedName() });
    } else if (ex instanceof CheckedConstructEx) {
      return this.#handleAction(phase, 'fun', ex.fields.map(() => undefined).unshift(undefined), ex.fields.map(it => it.value).unshift(ex.base), args => {
        const fields = ex.fields.zipWith<JsExpression, JsConstructField>(( param, arg) => {
          return new JsConstructField({
            name: param.name,
            value: arg,
          });
        }, args.shift());

        return new JsConstruct({
          base: args.first()!,
          fields,
        })
      });
    } else if (ex instanceof CheckedLambdaEx) {
      const args = ex.params.map(it => it.name);
      const body = this.#compileExpression(ex.body, ex.functionPhase);

      if (body instanceof JsBlock) {
        const last = body.body.last();

        if (last instanceof JsReturn) {
          return new JsLambdaEx({
            args,
            body: body.body,
          });
        } else if (last instanceof JsExpressionStatement) {
          const init = body.body.pop();

          return new JsLambdaEx({
            args,
            body: init.push(new JsReturn({body: last.base })),
          });
        } else {
          return new JsLambdaEx({
            args,
            body: body.body.push(new JsReturn({body: body.result})),
          });
        }
      } else {
        return new JsLambdaEx({
          args,
          body: List.of(new JsReturn({ body })),
        })
      }
    } else if (ex instanceof CheckedCallEx) {
      // handle operators here
      // todo: find a better way to extract operators than this
      if (ex.func instanceof CheckedIdentifierEx && ['+', '-', '*', '/', '==', '!=', '<', '<=', '>', '>='].includes(ex.func.name)) {
        if (ex.func.name === '-' && ex.args.size === 1) {
          return this.#handleUnaryOp('-', phase, ex.args.first()!);
        } else {
          return this.#handleBinaryOp(ex.func.name, phase, ex.args.get(0)!, ex.args.get(1)!);
        }
      }

      // todo: we're special casing this until we have methods that can handle it
      if (ex.func instanceof CheckedIdentifierEx && ex.func.name === 'toString') {
        return this.#handleAction(phase, 'fun', List.of(undefined), ex.args, args => {
          return new JsCall({
            func: new JsIdentifierEx({name: 'String'}),
            args,
          })
        });
      }

      const funcType = ex.func.type;

      if (funcType instanceof CheckedFunctionType) {
        return this.#use(this.#compileExpression(ex.func, phase), func => {
          return this.#handleCall(func, phase, funcType, ex.args);
        });
      } else if (funcType instanceof CheckedTupleType) {
        return ex.pos.fail("I can't handle tuples just yet");
      } else {
        return ex.pos.fail("Something is wrong, this looks like a function call but it's not a function or tuple")
      }
    } else if (ex instanceof CheckedIfEx) {
      const condition = this.#compileExpression(ex.condition, phase);
      const resultId = this.#nextId();
      const syntheticResult = new JsDeclareVar({
        name: resultId,
      });

      function blockify(src: JsBlock | JsExpression): List<JsStatement> {
        const name = new JsIdentifierEx({ name: resultId });

        if (src instanceof JsBlock) {
          return src.body.push(new JsReassign({ name, body: src.result }));
        } else {
          return List.of(new JsReassign({ name, body: src }));
        }
      }

      const thenBlock = blockify(this.#compileExpression(ex.thenEx, phase));
      const elseBlock = blockify(ex.elseEx === undefined ? new JsUndefined({}) : this.#compileExpression(ex.elseEx, phase));

      return this.#use(condition, condition => {
        // handle a flow condition
        if (phase === 'def' && (ex.condition.phase === 'flow' || ex.condition.phase === 'var')) {
          return new JsCall({
            func: new JsIdentifierEx({name: '_flow'}),
            args: List.of<JsExpression>(
              new JsArray({args: List.of(condition)}),
              new JsLambdaEx({
                args: List.of('_0'),
                body: List.of<JsStatement>(
                  syntheticResult,
                  new JsIf({
                    condition: new JsIdentifierEx({name: '_0'}),
                    thenBlock,
                    elseBlock,
                  }),
                  new JsReturn({ body: new JsIdentifierEx({ name: resultId }) }),
                )
              })
            ),
          })
        } else if (phase === 'sig' && (ex.condition.phase === 'flow' || ex.condition.phase === 'var')) {
          // simply do a '.get()' to unwrap a flow or var if you're in a sig
          return new JsBlock({
            result: new JsIdentifierEx({ name: resultId }),
            body: List.of<JsStatement>(
              syntheticResult,
              new JsIf({
                condition: this.#flowGet(condition),
                thenBlock,
                elseBlock,
              }),
            )
          })
        } else {
          // this is a normal `if`, nothing special here
          return new JsBlock({
            result: new JsIdentifierEx({name: resultId}),
            body: List.of<JsStatement>(
              syntheticResult,
              new JsIf({
                condition,
                thenBlock,
                elseBlock,
              }),
            )
          });
        }
      });
    } else if (ex instanceof CheckedReturnEx) {
      return this.#use(this.#compileExpression(ex.base, phase), base => {
        // if we are inside a def and the value we're trying to return is a val or const, wrap it in a singleton
        const wrapped = phase === 'def' && (ex.phase === 'val' || ex.phase === 'const') ? new JsSingleton({ init: base }) : base;

        return new JsBlock({
          result: new JsUndefined({}),
          body: List.of(
            new JsReturn({body: wrapped}),
          )
        })
      });
    } else if (ex instanceof CheckedNoOpEx) {
      // TODO: instead of this, emit a runtime error
      return ex.pos.fail('This no op is trying to be emitted. This should not happen!');
    } else {
      return ex.body.reduce((prev, state) => {
        const next = this.#compileStatement(state, phase);

        return next.update('body', body => prev.body.concat(body));
      }, new JsBlock({ body: List(), result: new JsUndefined({}) }))
    }
  }

  #compileStatement(state: CheckedStatement, phase: FunctionPhase): JsBlock {
    if (state instanceof CheckedExpressionStatement) {
      const base = this.#compileExpression(state.expression, phase);

      if (base instanceof JsBlock) {
        if (base.body.last() instanceof JsReturn) {
          return base;
        } else {
          return base.update('body', body => body.push(new JsExpressionStatement({base: base.result})));
        }
      } else {
        return new JsBlock({
          result: base,
          body: List.of(new JsExpressionStatement({base})),
        })
      }
    } else if (state instanceof CheckedAssignmentStatement) {
      const value = this.#handleVar(this.#compileExpression(state.expression, phase), state.phase);

      if (value instanceof JsBlock) {
        return new JsBlock({
          body: value.body.push(new JsAssign({ name: state.name, body: value.result })),
          result: new JsUndefined({}),
        });
      } else {
        return new JsBlock({
          body: List.of(new JsAssign({ name: state.name, body: value })),
          result: new JsUndefined({}),
        });
      }
    } else if (state instanceof CheckedReassignmentStatement) {
      const name = state.name.shift().reduce<JsExpression>((base, next) => {
        return new JsProjection({ base, property: next.name })
      }, new JsIdentifierEx({ name: state.name.first()!.name }));
      const value = this.#compileExpression(state.expression, phase);

      if (value instanceof JsBlock) {
        return new JsBlock({
          body: value.body.push(new JsReassign({ name, body: value.result })),
          result: new JsUndefined({}),
        });
      } else {
        return new JsBlock({
          body: List.of(new JsReassign({ name, body: value })),
          result: new JsUndefined({}),
        });
      }
    } else {
      return new JsBlock({
        result: new JsUndefined({}),
        body: List.of(this.#compileFunctionStatement(state)),
      });
    }
  }

  #compileFunctionStatement(state: CheckedFunction): JsFunctionStatement {
    const body = this.#compileExpression(state.body, state.functionPhase);

    if (body instanceof JsBlock) {
      const last = body.body.last();

      if (last instanceof JsReturn) {
        return new JsFunctionStatement({
          name: state.name,
          args: state.params.map(it => it.name),
          body: body.body,
        });
      } else if (last instanceof JsExpressionStatement) {
        const init = body.body.pop();

        return new JsFunctionStatement({
          name: state.name,
          args: state.params.map(it => it.name),
          body: init.push(new JsReturn({body: last.base })),
        });
      } else {
        return new JsFunctionStatement({
          name: state.name,
          args: state.params.map(it => it.name),
          body: body.body.push(new JsReturn({body: body.result})),
        });
      }
    } else {
      return new JsFunctionStatement({
        name: state.name,
        args: state.params.map(it => it.name),
        body: List.of(new JsReturn({body})),
      });
    }
  }

  #handleVar(value: JsBlock | JsExpression, phase: ExpressionPhase): JsBlock | JsExpression {
    if (phase === 'var') {
      return this.#use(value, base =>
        new JsCall({
          func: new JsIdentifierEx({name: '_variable'}),
          args: List.of(base),
        })
      )
    } else {
      return value;
    }
  }

  #use(src: JsBlock | JsExpression, handle: (ex: JsExpression) => JsBlock | JsExpression): JsBlock | JsExpression {
    if (src instanceof JsBlock) {
      const newResult = handle(src.result);

      if (newResult instanceof JsBlock) {
        return newResult.update('body', body => src.body.concat(body));
      } else {
        return src.set('result', newResult);
      }
    } else {
      return handle(src);
    }
  }

  #handleCall(func: JsExpression, phase: FunctionPhase, funcType: CheckedFunctionType, args: List<CheckedExpression>): JsBlock | JsExpression {
    return this.#handleAction(phase, funcType.phase, funcType.params.map(it => it.phase), args, finalArgs => {
      return new JsCall({
        func,
        args: finalArgs,
      });
    });
  }

  #handleUnaryOp(op: string, phase: FunctionPhase, arg: CheckedExpression): JsBlock | JsExpression {
    return this.#handleAction(phase, 'fun', List.of(undefined), List.of(arg), args => {
      return new JsUnaryOp({
        op,
        base: args.first()!,
      });
    });
  }

  #handleBinaryOp(op: string, phase: FunctionPhase, left: CheckedExpression, right: CheckedExpression): JsBlock | JsExpression {
    return this.#handleAction(phase, 'fun', List.of(undefined, undefined), List.of(left, right), args => {
      return new JsBinaryOp({
        op,
        left: args.first()!,
        right: args.last()!,
      });
    });
  }

  #handleAction(phase: FunctionPhase, callFuncPhase: FunctionPhase, paramPhases: List<ExpressionPhase | undefined>, args: List<CheckedExpression>, resultHandler: (args: List<JsExpression>) => JsExpression): JsBlock | JsExpression {
    // def -> fun -- handle with the _flow function
    // def -> def -- handle with the _def function

    if (phase === 'def') {
      // we could call a 'def' or 'fun' here. The only difference is which function we wrap them with, the function arguments are handled the same
      const pairs = paramPhases.zip<CheckedExpression>(args).map<[pre: {
        ex: JsBlock | JsExpression,
        id: string
      } | undefined, post: JsBlock | JsExpression]>(([paramPhase, arg], index) => {
        const compiled = this.#compileExpression(arg, phase);

        switch (paramPhase) {
          case 'flow':
            // if arg is a flow or var nothing special needs to be done, otherwise we need to wrap it in a singleton
            if (arg.phase === 'const' || arg.phase === 'val') {
              if (compiled instanceof JsBlock) {
                return [undefined, compiled.update('result', init => new JsSingleton({init}))];
              } else {
                return [undefined, new JsSingleton({init: compiled})];
              }
            } else {
              return [undefined, compiled];
            }
          case 'var':
            // only two things are allowed here
            // #1 is a single identifier - no special handling
            // #2 is a chain of accessors - chain needs to be turned into projections
            if (arg instanceof CheckedAccessEx) {
              return [undefined, this.#buildProjection(arg)];
            } else {
              return [undefined, compiled];
            }
          default:
            // if arg is a flow or var it needs to be broken out, otherwise it does not
            if (arg.phase === 'flow' || arg.phase === 'var') {
              const id = `_${index}`;

              return [{ex: compiled, id,}, new JsIdentifierEx({name: id})];
            } else {
              return [undefined, compiled];
            }
        }
      });

      // if there are no arguments that need to be passed by lambda
      if (pairs.every(([pre]) => pre === undefined)) {
        // then we don't need to handle this function special at all, we can treat it like a normal function

        const {list, statements} = this.#mergeBlocks(pairs.map(([_, post]) => post));

        const call = resultHandler(list);

        if (statements === undefined) {
          return call
        } else {
          return new JsBlock({body: statements, result: call});
        }
      } else {
        // some arguments need to be handled
        const handler = callFuncPhase === 'def' ? new JsIdentifierEx({name: '_def'}) : new JsIdentifierEx({name: '_flow'});

        // before the lambda
        const {list: preList, statements: preStatements} = this.#mergeBlocks(pairs.flatMap(([pre]) => {
          if (pre === undefined) {
            return [];
          } else {
            return [pre.ex];
          }
        }));

        // inside the lambda
        const {list: postList, statements: postStatements} = this.#mergeBlocks(pairs.map(([_, post]) => post));

        const funcCall = new JsCall({
          func: handler,
          args: List.of<JsExpression>(
            // array of prehandler arguments
            new JsArray({args: preList}),
            // the lambda
            new JsLambdaEx({
              args: pairs.flatMap<string>(([pre]) => pre === undefined ? [] : [pre.id]),
              body: (postStatements ?? List()).push(new JsReturn({
                body: resultHandler(postList),
              })),
            })
          )
        });

        if (preStatements === undefined) {
          return funcCall;
        } else {
          return new JsBlock({
            body: preStatements,
            result: funcCall,
          });
        }
      }
    } else if (phase === 'sig') {
      // here we can either call another sig or a fun
      // either way if the parameter is a val while the argument is a var or a flow it must be unwrapped
      // if the parameter is a flow and the argument is not a flow nor a var it must be made into a singleton
      // if the parameter is var only var is allowed, but it might be a projection

      const blocks = paramPhases.zip<CheckedExpression>(args).map(([paramPhase, arg]) => {
        const compiled = this.#compileExpression(arg, phase);

        switch (paramPhase) {
          case 'flow':
            // do wrapping if needed
            if (arg.phase === 'const' || arg.phase === 'val') {
              // need to wrap in a singleton
              if (compiled instanceof JsBlock) {
                return compiled.update('result', init => new JsSingleton({init}));
              } else {
                return new JsSingleton({init: compiled});
              }
            } else {
              // no changes
              return compiled;
            }
          case 'val':
          case undefined:
            if (arg.phase === 'flow' || arg.phase === 'var') {
              // need to unwrap the flow to call this
              return this.#use(compiled, body => this.#flowGet(body));
            } else {
              // no changes
              return compiled;
            }
          case 'var':
          default:
            return compiled;
        }
      });

      const {list, statements} = this.#mergeBlocks(blocks);

      const call = resultHandler(list);

      if (statements === undefined) {
        return call
      } else {
        return new JsBlock({body: statements, result: call});
      }
    } else {
      // this is a normal function call, nothing special about it's arguments
      const {list, statements} = this.#mergeBlocks(args.map(it => this.#compileExpression(it, phase)));

      const call = resultHandler(list);

      if (statements === undefined) {
        return call
      } else {
        return new JsBlock({body: statements, result: call});
      }
    }
  }

  /**
   * Used inside a sig to 'get' from a flow, or push that 'get' down through projection chains
   */
  #flowGet(body: JsExpression): JsExpression {
    // if we have a projection instead of doing `project(base, 'field').get()` we can instead do `base.get().field` which gets us the same thing with less overhead
    if (body instanceof JsProjection) {
      return new JsAccess({base: this.#flowGet(body.base), field: body.property});
    } else {
      return new JsFlowGet({body});
    }
  }

  #handleListSetLiteral(func: JsExpression, phase: FunctionPhase,  args: List<CheckedExpression>): JsBlock | JsExpression {
    // def -> fun -- handle with the _flow function
    // def -> def -- handle with the _def function
    if (phase === 'def') {
      // we could call a 'def' or 'fun' here. The only difference is which function we wrap them with, the function arguments are handled the same
      const pairs = args.map<[pre: { ex: JsBlock | JsExpression, id: string} | undefined, post: JsBlock | JsExpression]>((arg, index) => {
        const compiled = this.#compileExpression(arg, phase);

        // if arg is a flow or var it needs to be broken out, otherwise it does not
        if (arg.phase === 'flow' || arg.phase === 'var') {
          const id = `_${index}`;

          return [{ex: compiled, id, }, new JsIdentifierEx({name: id})];
        } else {
          return [undefined, compiled];
        }
      });

      // if there are no arguments that need to be passed by lambda
      if (pairs.every(([pre]) => pre === undefined)) {
        // then we don't need to handle this function special at all, we can treat it like a normal function

        const { list, statements } = this.#mergeBlocks(pairs.map(([_, post]) => post));

        const call = new JsCall({
          func,
          args: List.of(new JsArray({ args: list})),
        });

        if (statements === undefined) {
          return call
        } else {
          return new JsBlock({ body: statements, result: call });
        }
      } else {
        // some arguments need to be handled
        const handler = new JsIdentifierEx({ name: '_flow' });

        // before the lambda
        const { list: preList, statements: preStatements } = this.#mergeBlocks(pairs.flatMap(([pre]) => {
          if (pre === undefined) {
            return [];
          } else {
            return [pre.ex];
          }
        }));

        // inside the lambda
        const { list: postList, statements: postStatements } = this.#mergeBlocks(pairs.map(([_, post]) => post));

        const funcCall = new JsCall({
          func: handler,
          args: List.of<JsExpression>(
            // array of prehandler arguments
            new JsArray({ args: preList }),
            // the lambda
            new JsLambdaEx({
              args: pairs.flatMap<string>(([pre]) => pre === undefined ? [] : [pre.id]),
              body: (postStatements ?? List()).push(new JsReturn({
                body: new JsCall({
                  func,
                  args: List.of(new JsArray({ args: postList})),
                })
              })),
            })
          )
        });

        if (preStatements === undefined) {
          return funcCall;
        } else {
          return new JsBlock({
            body: preStatements,
            result: funcCall,
          });
        }
      }
    } else {
      // this is a normal function call, nothing special about it's arguments
      const { list, statements } = this.#mergeBlocks(args.map(it => this.#compileExpression(it, phase)));

      const call = new JsCall({
        func,
        args: List.of(new JsArray({ args: list})),
      });

      if (statements === undefined) {
        return call
      } else {
        return new JsBlock({ body: statements, result: call });
      }
    }
  }

  #handleMapLiteral(func: JsExpression, phase: FunctionPhase,  args: List<CheckedMapLiteralEntry>): JsBlock | JsExpression {
    // def -> fun -- handle with the _flow function
    // def -> def -- handle with the _def function
    if (phase === 'def') {
      // we could call a 'def' or 'fun' here. The only difference is which function we wrap them with, the function arguments are handled the same
      const pairs = args
        .flatMap(it => [it.key, it.value])
        .map<[pre: { ex: JsBlock | JsExpression, id: string} | undefined, post: JsBlock | JsExpression]>((arg, index) => {
          const compiled = this.#compileExpression(arg, phase);

          // if arg is a flow or var it needs to be broken out, otherwise it does not
          if (arg.phase === 'flow' || arg.phase === 'var') {
            const id = `_${index}`;

            return [{ex: compiled, id, }, new JsIdentifierEx({name: id})];
          } else {
            return [undefined, compiled];
          }
      });

      // if there are no arguments that need to be passed by lambda
      if (pairs.every(([pre]) => pre === undefined)) {
        // then we don't need to handle this function special at all, we can treat it like a normal function

        const { list, statements } = this.#mergeBlocks(pairs.map(([_, post]) => post));
        const [keys, values] = list.partition((_, index) => index % 2 === 0);
        const rePaired = keys.zipWith<JsExpression, JsArray>((key, value) => new JsArray({args: List.of(key, value)}), values);

        const call = new JsCall({
          func,
          args: List.of(new JsArray({ args: rePaired})),
        });

        if (statements === undefined) {
          return call
        } else {
          return new JsBlock({ body: statements, result: call });
        }
      } else {
        // some arguments need to be handled
        const handler = new JsIdentifierEx({ name: '_flow' });

        // before the lambda
        const { list: preList, statements: preStatements } = this.#mergeBlocks(pairs.flatMap(([pre]) => {
          if (pre === undefined) {
            return [];
          } else {
            return [pre.ex];
          }
        }));

        // inside the lambda
        const { list: postList, statements: postStatements } = this.#mergeBlocks(pairs.map(([_, post]) => post));

        const [keys, values] = postList.partition((_, index) => index % 2 === 0);
        const rePaired = keys.zipWith<JsExpression, JsArray>((key, value) => new JsArray({args: List.of(key, value)}), values);

        const funcCall = new JsCall({
          func: handler,
          args: List.of<JsExpression>(
            // array of prehandler arguments
            new JsArray({ args: preList }),
            // the lambda
            new JsLambdaEx({
              args: pairs.flatMap<string>(([pre]) => pre === undefined ? [] : [pre.id]),
              body: (postStatements ?? List()).push(new JsReturn({
                body: new JsCall({
                  func,
                  args: List.of(new JsArray({ args: rePaired })),
                })
              })),
            })
          )
        });

        if (preStatements === undefined) {
          return funcCall;
        } else {
          return new JsBlock({
            body: preStatements,
            result: funcCall,
          });
        }
      }
    } else {
      // this is a normal function call, nothing special about it's arguments
      const { list, statements } = this.#mergeBlocks(args.flatMap(it => [this.#compileExpression(it.key, phase), this.#compileExpression(it.value, phase)]));
      const [keys, values] = list.partition((_, index) => index % 2 === 0);
      const rePaired = keys.zipWith<JsExpression, JsArray>((key, value) => new JsArray({args: List.of(key, value)}), values);

      const call = new JsCall({
        func,
        args: List.of(new JsArray({ args: rePaired})),
      });

      if (statements === undefined) {
        return call
      } else {
        return new JsBlock({ body: statements, result: call });
      }
    }
  }

  /**
   * Only call this inside a 'def' function
   */
  #buildProjection(ex: CheckedAccessEx): JsBlock | JsProjection {
    const base = ex.base;
    const converted = base instanceof CheckedAccessEx ? this.#buildProjection(base) : this.#compileExpression(base, 'def');

    if (converted instanceof JsBlock) {
      return converted.update('result', init => new JsProjection({ base: init, property: ex.field.name }));
    } else {
      return new JsProjection({ base: converted, property: ex.field.name })
    }
  }

  #mergeBlocks(src: List<JsBlock | JsExpression>): { list: List<JsExpression>, statements?: List<JsStatement> } {
    let statements = List<JsStatement>();

    const list = src.map(it => {
      if (it instanceof JsBlock) {
        // if this is a block, add its children to the list of statements and return an expression pulling the var
        statements = statements.concat(it.body);
        return it.result;
      } else {
        // this is an expression, just return it
        return it;
      }
    });

    // if statements is empty, that means we can omit it and return undefined
    if (statements.isEmpty()) {
      return { list };
    } else {
      // otherwise we need to keep the block logic
      return { list, statements, };
    }
  }
}


