import {
  CheckedAccessEx,
  CheckedAndEx,
  CheckedAssignmentStatement,
  CheckedBlockEx,
  CheckedBooleanLiteralEx,
  CheckedCallEx,
  CheckedConstantDeclare,
  CheckedConstructEx,
  type CheckedDeclaration,
  type CheckedExpression,
  CheckedExpressionStatement,
  CheckedFile,
  CheckedFloatLiteralEx,
  CheckedFunctionDeclare,
  CheckedIdentifierEx,
  CheckedIfEx,
  CheckedImplDeclare,
  CheckedIntLiteralEx,
  CheckedIsEx,
  CheckedLambdaEx,
  CheckedListLiteralEx,
  CheckedMapLiteralEx,
  CheckedNoOpEx,
  CheckedNotEx,
  CheckedOrEx,
  CheckedReassignmentStatement,
  CheckedSetLiteralEx,
  type CheckedStatement,
  CheckedStaticAccessEx,
  CheckedStaticReferenceEx,
  CheckedStringLiteralEx
} from '../checker/checkerAst.ts';

export type Transformer = (file: CheckedFile) => CheckedFile;

export interface TransformerConfig {
  preExpression?(ex: CheckedExpression): CheckedExpression;
  expression?(ex: CheckedExpression): CheckedExpression;
  preStatement?(state: CheckedStatement): CheckedStatement;
  statement?(state: CheckedStatement): CheckedStatement;

  // TODO: might need to extend declaration support, making sure they are passed in a set order, handling them special
  preDeclaration?(dec: CheckedDeclaration): void;
  declaration?(dec: CheckedDeclaration): CheckedDeclaration;

  // TODO: add hooks for starting and stopping each CheckedFile
}

export function buildTransformer(trans: TransformerConfig): Transformer {
  function expressionStep(ex: CheckedExpression): CheckedExpression {
    const pre = trans.preExpression?.(ex) ?? ex;
    const walked = expressionWalker(pre);

    return trans.expression?.(walked) ?? walked;
  }

  function expressionWalker(ex: CheckedExpression): CheckedExpression {
    if (ex instanceof CheckedBooleanLiteralEx) {
      return ex;
    } else if (ex instanceof CheckedIntLiteralEx) {
      return ex;
    } else if (ex instanceof CheckedFloatLiteralEx) {
      return ex;
    } else if (ex instanceof CheckedStringLiteralEx) {
      return ex;
    } else if (ex instanceof CheckedIdentifierEx) {
      return ex;
    } else if (ex instanceof CheckedListLiteralEx) {
      return ex.set('values', ex.values.map(expressionStep));
    } else if (ex instanceof CheckedSetLiteralEx) {
      return ex.set('values', ex.values.map(expressionStep));
    } else if (ex instanceof CheckedMapLiteralEx) {
      return ex.set('values', ex.values.map(entry => entry.update('key', expressionStep).update('value', expressionStep)));
    } else if (ex instanceof CheckedIsEx) {
      return ex.update('base', expressionStep).update('check', expressionStep);
    } else if (ex instanceof CheckedNotEx) {
      return ex.update('base', expressionStep);
    } else if (ex instanceof CheckedOrEx) {
      return ex.update('left', expressionStep).update('right', expressionStep);
    } else if (ex instanceof CheckedAndEx) {
      return ex.update('left', expressionStep).update('right', expressionStep);
    } else if (ex instanceof CheckedAccessEx) {
      return ex.update('base', expressionStep);
    } else if (ex instanceof CheckedStaticAccessEx) {
      return ex;
    } else if (ex instanceof CheckedStaticReferenceEx) {
      return ex;
    } else if (ex instanceof CheckedConstructEx) {
      return ex.update('base', expressionStep).update('fields', fields => fields.map(it => it.update('value', expressionStep)));
    } else if (ex instanceof CheckedLambdaEx) {
      return ex.update('body', expressionStep);
    } else if (ex instanceof CheckedBlockEx) {
      return ex.update('body', body => body.map(statementStep));
    } else if (ex instanceof CheckedNoOpEx) {
      return ex;
    } else if (ex instanceof CheckedCallEx) {
      return ex.update('func', expressionStep).update('args', args => args.map(expressionStep));
    } else if (ex instanceof CheckedIfEx) {
      return ex.update('condition', expressionStep).update('thenEx', expressionStep).update('elseEx', elseEx => elseEx === undefined ? undefined : expressionStep(elseEx));
    } else {
      return ex.update('base', expressionStep);
    }
  }

  function statementStep(state: CheckedStatement): CheckedStatement {
    const pre = trans.preStatement?.(state) ?? state;
    const walked = statementWalker(pre);

    return trans.statement?.(walked) ?? walked;
  }

  function statementWalker(state: CheckedStatement): CheckedStatement {
    if (state instanceof CheckedExpressionStatement) {
      return state.update('expression', expressionStep);
    } else if (state instanceof CheckedAssignmentStatement) {
      return state.update('expression', expressionStep);
    } else if (state instanceof CheckedReassignmentStatement) {
      return state.update('expression', expressionStep);
    } else {
      return state.update('body', expressionStep);
    }
  }

  function declarationStep(dec: CheckedDeclaration): CheckedDeclaration {
    const pre = trans.preDeclaration?.(dec) ?? dec;
    const walked = declarationWalker(pre);

    return trans.declaration?.(walked) ?? walked;
  }

  function declarationWalker(dec: CheckedDeclaration): CheckedDeclaration {
    if (dec instanceof CheckedFunctionDeclare) {
      return dec.update('body', expressionStep);
    } else if (dec instanceof CheckedConstantDeclare) {
      return dec.update('expression', expressionStep);
    } else if (dec instanceof CheckedImplDeclare) {
      return dec.update('methods', methods => methods.map(it => {
        const result = declarationStep(it);

        if (result instanceof CheckedFunctionDeclare) {
          return result;
        } else {
          throw new Error('Transformer turned a FunctionDeclare into something else. This is not allowed and is a bug in the compiler!');
        }
      }));
    } else {
      return dec;
    }
  }

  return file => file.update('declarations', declarations => declarations.map(declarationStep));
}
