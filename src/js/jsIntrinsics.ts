import type { Symbol } from '../ast.ts';
import {
  JsAccess,
  JsArray,
  JsArrayAccess,
  JsBinaryOp,
  JsCall,
  type JsExpression,
  JsNumberLiteralEx,
  JsUnaryOp
} from './jsIr.ts';
import { coreSymbol } from '../lib.ts';
import { List, Map } from 'immutable';

/**
 * Special cases for functions that can be implemented more efficiently with some kind of native usage, like `+` for numbers or `==` on strings.
 *
 * Strictly speaking, ANY function can be an intrinsic and can be implemented in any arbitrary JsExpression.
 */
export const intrinsics = Map<Symbol, (...args: Array<JsExpression>) => JsExpression>()
  .set(coreSymbol.child('math').child('Int').child('AddOp').child('addOp'), (left, right) => {
    return new JsBinaryOp({
      left: new JsBinaryOp({
        left,
        op: '+',
        right,
      }),
      op: '|',
      right: new JsNumberLiteralEx({
        value: 0,
      })
    })
  })
  .set(coreSymbol.child('math').child('Int').child('SubOp').child('subtractOp'), (left, right) => {
    return new JsBinaryOp({
      left: new JsBinaryOp({
        left,
        op: '-',
        right,
      }),
      op: '|',
      right: new JsNumberLiteralEx({
        value: 0,
      })
    })
  })
  .set(coreSymbol.child('math').child('Int').child('MulOp').child('multiplyOp'), (left, right) => {
    return new JsBinaryOp({
      left: new JsBinaryOp({
        left,
        op: '*',
        right,
      }),
      op: '|',
      right: new JsNumberLiteralEx({
        value: 0,
      })
    })
  })
  .set(coreSymbol.child('math').child('Int').child('DivOp').child('divideOp'), (left, right) => {
    return new JsBinaryOp({
      left: new JsBinaryOp({
        left,
        op: '/',
        right
      }),
      op: '|',
      right: new JsNumberLiteralEx({
        value: 0
      })
    });
  })
  .set(coreSymbol.child('math').child('Int').child('NegateOp').child('negateOp'), (base) => {
    return new JsUnaryOp({
      base,
      op: '-'
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Equal').child('equal'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '==',
      right
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Equal').child('notEqual'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '!=',
      right
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Ordered').child('greaterThan'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '>',
      right
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Ordered').child('greaterThanOrEqualTo'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '>=',
      right
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Ordered').child('lessThan'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '<',
      right
    });
  })
  .set(coreSymbol.child('math').child('Int').child('Ordered').child('lessThanOrEqualTo'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '<=',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('AddOp').child('addOp'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '+',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('SubOp').child('subtractOp'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '-',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('MulOp').child('multiplyOp'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '*',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('DivOp').child('divideOp'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '/',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('NegateOp').child('negateOp'), (base) => {
    return new JsUnaryOp({
      base,
      op: '-'
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Equal').child('equal'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '==',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Equal').child('notEqual'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '!=',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Ordered').child('greaterThan'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '>',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Ordered').child('greaterThanOrEqualTo'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '>=',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Ordered').child('lessThan'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '<',
      right
    });
  })
  .set(coreSymbol.child('math').child('Float').child('Ordered').child('lessThanOrEqualTo'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '<=',
      right
    });
  })
  .set(coreSymbol.child('string').child('String').child('Equal').child('equal'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '==',
      right
    });
  })
  .set(coreSymbol.child('string').child('String').child('Equal').child('notEqual'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '!=',
      right
    });
  })
  .set(coreSymbol.child('string').child('String').child('concat'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '+',
      right
    });
  })
  .set(coreSymbol.child('bool').child('Boolean').child('Equal').child('equal'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '==',
      right
    });
  })
  .set(coreSymbol.child('bool').child('Boolean').child('Equal').child('notEqual'), (left, right) => {
    return new JsBinaryOp({
      left,
      op: '!=',
      right
    });
  })
  .set(coreSymbol.child('array').child('Array').child('size'), (base) => {
    return new JsAccess({
      base,
      field: 'length',
    });
  })
  .set(coreSymbol.child('array').child('Array').child('get'), (arr, index) => {
    return new JsArrayAccess({
      base: arr,
      field: index,
    });
  })
  .set(coreSymbol.child('array').child('Array').child('set'), (arr, index, item) => {
    return new JsCall({
      func: new JsAccess({
        base: arr,
        field: 'with'
      }),
      args: List.of(
        index,
        item,
      ),
    });
  })
  .set(coreSymbol.child('array').child('Array').child('add'), (arr, item) => {
    return new JsArray({
      args: List.of(
        new JsUnaryOp({
          op: '...',
          base: arr,
        }),
        item,
      ),
    })
  })
;
