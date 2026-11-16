import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../typed/node-views.mts';
import { looseForm, unvalidatedRoot } from './schema-fields/field-walk.mts';
import { ajvSchemaArgument, jsonSchemaFindings } from './schema-fields/json-schema-fields.mts';
import { calledExport, propertyName, type SchemaLibrary } from './schema-fields/library-nodes.mts';
import { isShapeMethod, SCHEMA_FORMS } from './schema-fields/schema-forms.mts';
import {
  opaqueTypeFields,
  presenceOnlyDecorators,
  typiaTypeArgument,
} from './schema-fields/typed-fields.mts';

type MessageId = 'unvalidatedField' | 'customWithoutValidator' | 'looseObject';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const CLASS_VALIDATOR_EXAMPLE = '@IsString() @MinLength(1) or @IsEmail()';
const TYPIA_EXAMPLE = "string & tags.MinLength<1> or string & tags.Format<'email'>";

function shapeOf(
  sourceCode: SourceCode,
  node: TSESTree.CallExpression,
): { readonly owner: SchemaLibrary | undefined } | undefined {
  const called = calledExport(sourceCode, node);
  if (called !== undefined) {
    return called.library.forms.objects.includes(called.name)
      ? { owner: called.library }
      : undefined;
  }
  return isShapeMethod(propertyName(node.callee)) ? { owner: undefined } : undefined;
}

function reportField(
  context: Context,
  node: TSESTree.Node,
  data: Readonly<Record<string, unknown>>,
): void {
  context.report({ node, messageId: 'unvalidatedField', data });
}

function reportLeaf(
  context: Context,
  node: TSESTree.Node,
  leaf: { readonly library: SchemaLibrary; readonly display: string; readonly cast?: true },
): void {
  if (leaf.cast) {
    context.report({ node, messageId: 'customWithoutValidator' });
    return;
  }
  reportField(context, node, { factory: leaf.display, example: leaf.library.forms.example });
}

function queueNested(
  pending: Set<TSESTree.ObjectExpression>,
  properties: readonly TSESTree.Property[],
): void {
  for (const { value } of properties) {
    if (value.type === AST_NODE_TYPES.ObjectExpression) {
      pending.add(value);
    }
  }
}

function shapeValues(
  shape: TSESTree.ObjectExpression,
  owner: SchemaLibrary | undefined,
): TSESTree.Node[] {
  const values: TSESTree.Node[] = [];
  const pending = new Set([shape]);
  for (const current of pending) {
    const properties = current.properties.filter(
      (property) => property.type === AST_NODE_TYPES.Property,
    );
    queueNested(pending, owner?.forms.stringLeaves === undefined ? [] : properties);
    values.push(
      ...properties
        .map(({ value }) => value)
        .filter((value) => !(value.type === AST_NODE_TYPES.ObjectExpression && pending.has(value))),
    );
  }
  return values;
}

function checkShape(context: Context, node: TSESTree.CallExpression): void {
  const found = shapeOf(context.sourceCode, node);
  const [shape] = node.arguments;
  if (found === undefined || shape?.type !== AST_NODE_TYPES.ObjectExpression) {
    return;
  }
  const { owner } = found;
  for (const value of shapeValues(shape, owner)) {
    const leaf = unvalidatedRoot(context.sourceCode, value, owner);
    if (leaf !== undefined) {
      reportLeaf(context, value, leaf);
    }
  }
}

function checkLooseObject(context: Context, node: TSESTree.CallExpression): void {
  const loose = looseForm(context.sourceCode, node);
  if (loose === undefined) {
    return;
  }
  context.report({
    node,
    messageId: 'looseObject',
    data: { form: loose.form.form, allowed: loose.library.forms.allowed },
  });
}

function checkJsonSchema(context: Context, node: TSESTree.CallExpression): void {
  const schema = ajvSchemaArgument(context.sourceCode, node);
  const { allowed, example } = SCHEMA_FORMS.ajv;
  for (const finding of schema === undefined ? [] : jsonSchemaFindings(schema)) {
    if (finding.kind === 'loose') {
      context.report({
        node: finding.node,
        messageId: 'looseObject',
        data: { form: finding.text, allowed },
      });
    } else {
      reportField(context, finding.node, { factory: finding.text, example });
    }
  }
}

function checkTypiaType(context: Context, node: TSESTree.CallExpression): void {
  const { sourceCode } = context;
  const type = typiaTypeArgument(sourceCode, node);
  for (const field of type === undefined ? [] : opaqueTypeFields(sourceCode.ast, type)) {
    const text = sourceCode.getText(field.type);
    reportField(context, field.member, { factory: `The type ${text}`, example: TYPIA_EXAMPLE });
  }
}

function checkDecorators(
  context: Context,
  node: TSESTree.PropertyDefinition | TSESTree.AccessorProperty,
): void {
  const decorators = presenceOnlyDecorators(context.sourceCode, node);
  if (decorators !== undefined) {
    reportField(context, node, {
      factory: `${decorators} alone`,
      example: CLASS_VALIDATOR_EXAMPLE,
    });
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow unchecked fields (z.unknown(), v.any(), Joi.any(), Type.Unknown() and the like) and objects that keep unknown keys in the schemas of every validation library the preset knows',
    },
    schema: [],
    messages: {
      unvalidatedField:
        '{{factory}} lets any value of this field through unchecked. Validate the field in the schema, e.g. {{example}}. An exception fits only when the field is genuinely opaque.',
      customWithoutValidator:
        'z.custom() without a check function is a cast, not a validator. Pass the check, z.custom<T>((value) => ...), or build the schema from validating parts. An exception fits only when the value is genuinely opaque.',
      looseObject:
        '{{form}} lets unknown keys through unvalidated. Use {{allowed}}. An exception fits only when the extra keys are genuinely opaque.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        checkLooseObject(context, node);
        checkShape(context, node);
        checkJsonSchema(context, node);
        checkTypiaType(context, node);
      },
      PropertyDefinition(node) {
        checkDecorators(context, node);
      },
      AccessorProperty(node) {
        checkDecorators(context, node);
      },
    };
  },
};
