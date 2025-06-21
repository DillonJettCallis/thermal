import { buildTransformer, type Transformer, type TransformerConfig } from './transformer.ts';
import {
  CheckedBlockEx,
  type CheckedDeclaration,
  type CheckedExpression,
  CheckedExpressionStatement,
  CheckedFunctionDeclare,
  CheckedFunctionStatement,
  CheckedLambdaEx,
  CheckedReturnEx,
  type CheckedStatement
} from '../checker/checkerAst.ts';
import type { CoreTypes } from '../lib.ts';

/**
 * Turns implicit returns into explicit ones.
 *
 * ie:
 *
 * ```thermal
 *  fun test(): Int {
 *    2
 *  }
 *
 *  // becomes
 *
 *  fun (): Int {
 *    return 2
 *  }
 ** ```
 */
class ReturnLifter implements TransformerConfig {

  readonly #coreTypes: CoreTypes;

  constructor(coreTypes: CoreTypes) {
    this.#coreTypes = coreTypes;
  }

  #handleBody(ex: CheckedExpression): CheckedExpression {
    if (ex instanceof CheckedReturnEx) {
      // no change
      return ex;
    } else if (ex instanceof CheckedBlockEx) {
      // if the block ends in return, do nothing, otherwise consider it
      const last = ex.body.last()!;

      if (last instanceof CheckedExpressionStatement) {
        if (last.expression instanceof CheckedReturnEx) {
          // last is a return, do nothing
          return ex;
        } else {
          const state = last.update('expression', ex => new CheckedReturnEx({
            phase: ex.phase,
            pos: ex.pos,
            base: ex,
            type: this.#coreTypes.nothing,
          }));

          return ex.set('body', ex.body.pop().push(state));
        }
      }

      // the last thing in the block is not an expression which means the block actually returns nothing
      return ex;
    } else {
      // the lambda is some kind of expression that's not a return and not a block, return whatever it is

      return new CheckedReturnEx({
        phase: ex.phase,
        pos: ex.pos,
        type: this.#coreTypes.nothing,
        base: ex,
      });
    }
  }

  expression(ex: CheckedExpression): CheckedExpression {
    if (ex instanceof CheckedLambdaEx) {
      return ex.update('body', body => this.#handleBody(body));
    } else {
      return ex;
    }
  }

  statement(state: CheckedStatement): CheckedStatement {
    if (state instanceof CheckedFunctionStatement) {
      return state.update('body', body => this.#handleBody(body));
    } else {
      return state;
    }
  }

  declaration(dec: CheckedDeclaration): CheckedDeclaration {
    if (dec instanceof CheckedFunctionDeclare) {
      return dec.update('body', body => this.#handleBody(body));
    } else {
      return dec;
    }
  }
}

export function returnLifter(coreTypes: CoreTypes): Transformer {
  return buildTransformer(new ReturnLifter(coreTypes));
}
