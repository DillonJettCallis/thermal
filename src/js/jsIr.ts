import { List, Record, Set } from 'immutable';
import { Symbol } from '../ast.ts';

export type JsExpression
  = JsBooleanLiteralEx
  | JsNumberLiteralEx
  | JsStringLiteralEx
  | JsIdentifierEx
  | JsLambdaEx
  | JsSingleton
  | JsVariable
  | JsProjection
  | JsFlow
  | JsDef
  | JsFlowGet
  | JsUndefined
  | JsArray
  | JsConstruct
  | JsAccess
  | JsCall
  | JsBinaryOp
  | JsUnaryOp
  ;

export type JsStatement
  = JsDeclareVar
  | JsAssign
  | JsReassign
  | JsFunctionStatement
  | JsReturn
  | JsIf
  | JsExpressionStatement
  ;

export type JsDeclaration
  = JsImport
  | JsExport
  | JsConst
  | JsFunctionDeclare
  | JsDataDeclare
  | JsEnumDeclare
  ;

export type JsDataLayout
  = JsStructLayout
  | JsTupleLayout
  | JsAtomLayout
  ;

interface MutableJsBlock {
  body: List<JsStatement>;
  result: JsExpression;
}
export class JsBlock extends Record<MutableJsBlock>({
  body: undefined as unknown as List<JsStatement>,
  result: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsBlock) {
    super(props);
  }
}

interface MutableJsBooleanLiteralEx {
  value: boolean;
}
export class JsBooleanLiteralEx extends Record<MutableJsBooleanLiteralEx>({
  value: undefined as unknown as boolean,
}) {
  constructor(props: MutableJsBooleanLiteralEx) {
    super(props);
  }
}

interface MutableJsNumberLiteralEx {
  value: number;
}
export class JsNumberLiteralEx extends Record<MutableJsNumberLiteralEx>({
  value: undefined as unknown as number,
}) {
  constructor(props: MutableJsNumberLiteralEx) {
    super(props);
  }
}

interface MutableJsStringLiteralEx {
  value: string;
}
export class JsStringLiteralEx extends Record<MutableJsStringLiteralEx>({
  value: undefined as unknown as string,
}) {
  constructor(props: MutableJsStringLiteralEx) {
    super(props);
  }
}

interface MutableJsIdentifierEx {
  name: string;
}
export class JsIdentifierEx extends Record<MutableJsIdentifierEx>({
  name: undefined as unknown as string,
}) {
  constructor(props: MutableJsIdentifierEx) {
    super(props);
  }
}

interface MutableJsLambdaEx {
  args: List<string>;
  body: List<JsStatement>;
}
export class JsLambdaEx extends Record<MutableJsLambdaEx>({
  args: undefined as unknown as List<string>,
  body: undefined as unknown as List<JsStatement>,
}) {
  constructor(props: MutableJsLambdaEx) {
    super(props);
  }
}

interface MutableJsSingleton {
  init: JsExpression;
}
export class JsSingleton extends Record<MutableJsSingleton>({
  init: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsSingleton) {
    super(props);
  }
}

interface MutableJsVariable {
  init: JsExpression;
}
export class JsVariable extends Record<MutableJsVariable>({
  init: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsVariable) {
    super(props);
  }
}

interface MutableJsProjection {
  base: JsExpression;
  property: string;
}
export class JsProjection extends Record<MutableJsProjection>({
  base: undefined as unknown as JsExpression,
  property: undefined as unknown as string,
}) {
  constructor(props: MutableJsProjection) {
    super(props);
  }
}

interface MutableJsFlow {
  args: List<JsExpression>;
  body: JsLambdaEx;
}
export class JsFlow extends Record<MutableJsFlow>({
  args: undefined as unknown as List<JsExpression>,
  body: undefined as unknown as JsLambdaEx,
}) {
  constructor(props: MutableJsFlow) {
    super(props);
  }
}

interface MutableJsDef {
  args: List<JsExpression>;
  body: JsLambdaEx;
}
export class JsDef extends Record<MutableJsDef>({
  args: undefined as unknown as List<JsExpression>,
  body: undefined as unknown as JsLambdaEx,
}) {
  constructor(props: MutableJsDef) {
    super(props);
  }
}

interface MutableJsFlowGet {
  body: JsExpression;
}
export class JsFlowGet extends Record<MutableJsFlowGet>({
  body: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsFlowGet) {
    super(props);
  }
}

interface MutableJsUndefined {
}
export class JsUndefined extends Record<MutableJsUndefined>({
}) {
  constructor(props: MutableJsUndefined) {
    super(props);
  }
}

interface MutableJsArray {
  args: List<JsExpression>;
}
export class JsArray extends Record<MutableJsArray>({
  args: undefined as unknown as List<JsExpression>,
}) {
  constructor(props: MutableJsArray) {
    super(props);
  }
}

interface MutableJsConstructField {
  name: string;
  value: JsExpression;
}
export class JsConstructField extends Record<MutableJsConstructField>({
  name: undefined as unknown as string,
  value: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsConstructField) {
    super(props);
  }
}

interface MutableJsConstruct {
  base: JsExpression;
  fields: List<JsConstructField>;
}
export class JsConstruct extends Record<MutableJsConstruct>({
  base: undefined as unknown as JsExpression,
  fields: undefined as unknown as List<JsConstructField>,
}) {
  constructor(props: MutableJsConstruct) {
    super(props);
  }
}

interface MutableJsAccess {
  base: JsExpression;
  field: string;
}
export class JsAccess extends Record<MutableJsAccess>({
  base: undefined as unknown as JsExpression,
  field: undefined as unknown as string,
}) {
  constructor(props: MutableJsAccess) {
    super(props);
  }
}

interface MutableJsCall {
  func: JsExpression;
  args: List<JsExpression>;
}
export class JsCall extends Record<MutableJsCall>({
  func: undefined as unknown as JsExpression,
  args: undefined as unknown as List<JsExpression>,
}) {
  constructor(props: MutableJsCall) {
    super(props);
  }
}

interface MutableJsDeclareVar {
  name: string;
}
export class JsDeclareVar extends Record<MutableJsDeclareVar>({
  name: undefined as unknown as string,
}) {
  constructor(props: MutableJsDeclareVar) {
    super(props);
  }
}

interface MutableJsAssign {
  name: string;
  body: JsExpression;
}
export class JsAssign extends Record<MutableJsAssign>({
  name: undefined as unknown as string,
  body: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsAssign) {
    super(props);
  }
}

interface MutableJsReassign {
  name: JsExpression;
  body: JsExpression;
}
export class JsReassign extends Record<MutableJsReassign>({
  name: undefined as unknown as JsExpression,
  body: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsReassign) {
    super(props);
  }
}

interface MutableJsFunctionStatement {
  name: string;
  args: List<string>;
  body: List<JsStatement>;
}
export class JsFunctionStatement extends Record<MutableJsFunctionStatement>({
  name: undefined as unknown as string,
  args: undefined as unknown as List<string>,
  body: undefined as unknown as List<JsStatement>,
}) {
  constructor(props: MutableJsFunctionStatement) {
    super(props);
  }
}

interface MutableJsReturn {
  body: JsExpression;
}
export class JsReturn extends Record<MutableJsReturn>({
  body: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsReturn) {
    super(props);
  }
}

interface MutableJsIf {
  condition: JsExpression;
  thenBlock: List<JsStatement>;
  elseBlock: List<JsStatement>;
}
export class JsIf extends Record<MutableJsIf>({
  condition: undefined as unknown as JsExpression,
  thenBlock: undefined as unknown as List<JsStatement>,
  elseBlock: undefined as unknown as List<JsStatement>,
}) {
  constructor(props: MutableJsIf) {
    super(props);
  }
}

interface MutableJsBinaryOp {
  op: string;
  left: JsExpression;
  right: JsExpression;
}
export class JsBinaryOp extends Record<MutableJsBinaryOp>({
  op: undefined as unknown as string,
  left: undefined as unknown as JsExpression,
  right: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsBinaryOp) {
    super(props);
  }
}

interface MutableJsUnaryOp {
  op: string;
  base: JsExpression;
}
export class JsUnaryOp extends Record<MutableJsUnaryOp>({
  op: undefined as unknown as string,
  base: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsUnaryOp) {
    super(props);
  }
}

interface MutableJsExpressionStatement {
  base: JsExpression;
}
export class JsExpressionStatement extends Record<MutableJsExpressionStatement>({
  base: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsExpressionStatement) {
    super(props);
  }
}

interface MutableJsImport {
  from: string;
  take: string;
  as: string | undefined;
}
export class JsImport extends Record<MutableJsImport>({
  from: undefined as unknown as string,
  take: undefined as unknown as string,
  as: undefined as unknown as string | undefined,
}) {
  constructor(props: MutableJsImport) {
    super(props);
  }
}

interface MutableJsExport {
  name: string;
}
export class JsExport extends Record<MutableJsExport>({
  name: undefined as unknown as string,
}) {
  constructor(props: MutableJsExport) {
    super(props);
  }
}

interface MutableJsConst {
  name: string;
  body: JsExpression;
}
export class JsConst extends Record<MutableJsConst>({
  name: undefined as unknown as string,
  body: undefined as unknown as JsExpression,
}) {
  constructor(props: MutableJsConst) {
    super(props);
  }
}

interface MutableJsFunctionDeclare {
  export: boolean;
  func: JsFunctionStatement;
}
export class JsFunctionDeclare extends Record<MutableJsFunctionDeclare>({
  export: undefined as unknown as boolean,
  func: undefined as unknown as JsFunctionStatement,
}) {
  constructor(props: MutableJsFunctionDeclare) {
    super(props);
  }
}

interface MutableJsStructLayout {
  name: string;
  symbol: Symbol;
  fields: Set<string>;
}
export class JsStructLayout extends Record<MutableJsStructLayout>({
  name: undefined as unknown as string,
  symbol: undefined as unknown as Symbol,
  fields: undefined as unknown as Set<string>,
}) {
  constructor(props: MutableJsStructLayout) {
    super(props);
  }
}

interface MutableJsTupleLayout {
  name: string;
  symbol: Symbol;
  fields: List<string>;
}
export class JsTupleLayout extends Record<MutableJsTupleLayout>({
  name: undefined as unknown as string,
  symbol: undefined as unknown as Symbol,
  fields: undefined as unknown as List<string>,
}) {
  constructor(props: MutableJsTupleLayout) {
    super(props);
  }
}

interface MutableJsAtomLayout {
  name: string;
  symbol: Symbol;
}
export class JsAtomLayout extends Record<MutableJsAtomLayout>({
  name: undefined as unknown as string,
  symbol: undefined as unknown as Symbol,
}) {
  constructor(props: MutableJsAtomLayout) {
    super(props);
  }
}

interface MutableJsDataDeclare {
  export: boolean;
  layout: JsDataLayout;
}
export class JsDataDeclare extends Record<MutableJsDataDeclare>({
  export: undefined as unknown as boolean,
  layout: undefined as unknown as JsDataLayout,
}) {
  constructor(props: MutableJsDataDeclare) {
    super(props);
  }
}

interface MutableJsEnumDeclare {
  export: boolean;
  name: string;
  symbol: Symbol;
  variants: List<JsDataLayout>;
}
export class JsEnumDeclare extends Record<MutableJsEnumDeclare>({
  export: undefined as unknown as boolean,
  name: undefined as unknown as string,
  symbol: undefined as unknown as Symbol,
  variants: undefined as unknown as List<JsDataLayout>,
}) {
  constructor(props: MutableJsEnumDeclare) {
    super(props);
  }
}

interface MutableJsFile {
  name: string;
  main: boolean;
  declarations: List<JsDeclaration>;
}
export class JsFile extends Record<MutableJsFile>({
  name: undefined as unknown as string,
  main: undefined as unknown as boolean,
  declarations: undefined as unknown as List<JsDeclaration>,
}) {
  constructor(props: MutableJsFile) {
    super(props);
  }
}

