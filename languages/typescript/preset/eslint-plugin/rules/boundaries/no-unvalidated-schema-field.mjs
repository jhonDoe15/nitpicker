import { looseForm, unvalidatedRoot } from './schema-fields/field-walk.mjs';
import { ajvSchemaArgument, jsonSchemaFindings } from './schema-fields/json-schema-fields.mjs';
import { calledExport, propertyName } from './schema-fields/library-nodes.mjs';
import { isShapeMethod, SCHEMA_FORMS } from './schema-fields/schema-forms.mjs';
import {
  opaqueTypeFields,
  presenceOnlyDecorators,
  typiaTypeArgument,
} from './schema-fields/typed-fields.mjs';

const CLASS_VALIDATOR_EXAMPLE = '@IsString() @MinLength(1) or @IsEmail()';
const TYPIA_EXAMPLE = "string & tags.MinLength<1> or string & tags.Format<'email'>";

function shapeOf(sourceCode, node) {
  const called = calledExport(sourceCode, node);
  if (called !== undefined) {
    return called.library.forms.objects.includes(called.name)
      ? { owner: called.library }
      : undefined;
  }
  return isShapeMethod(propertyName(node.callee)) ? { owner: undefined } : undefined;
}

function reportField(context, node, data) {
  context.report({ node, messageId: 'unvalidatedField', data });
}

function reportLeaf(context, node, leaf) {
  if (leaf.cast) {
    context.report({ node, messageId: 'customWithoutValidator' });
    return;
  }
  reportField(context, node, { factory: leaf.display, example: leaf.library.forms.example });
}

function shapeValues(shape, owner) {
  const values = [];
  const pending = [shape];
  for (const current of pending) {
    const properties = current.properties.filter((property) => property.type === 'Property');
    const nested = owner?.forms.stringLeaves === undefined ? [] : properties;
    pending.push(
      ...nested.map(({ value }) => value).filter((value) => value.type === 'ObjectExpression'),
    );
    values.push(
      ...properties.map(({ value }) => value).filter((value) => !pending.includes(value)),
    );
  }
  return values;
}

function checkShape(context, node) {
  const found = shapeOf(context.sourceCode, node);
  const [shape] = node.arguments;
  if (found === undefined || shape?.type !== 'ObjectExpression') {
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

function checkLooseObject(context, node) {
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

function checkJsonSchema(context, node) {
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

function checkTypiaType(context, node) {
  const { sourceCode } = context;
  const type = typiaTypeArgument(sourceCode, node);
  for (const field of type === undefined ? [] : opaqueTypeFields(sourceCode.ast, type)) {
    const text = sourceCode.getText(field.typeAnnotation.typeAnnotation);
    reportField(context, field, { factory: `The type ${text}`, example: TYPIA_EXAMPLE });
  }
}

function checkDecorators(context, node) {
  const decorators = presenceOnlyDecorators(context.sourceCode, node);
  if (decorators !== undefined) {
    reportField(context, node, {
      factory: `${decorators} alone`,
      example: CLASS_VALIDATOR_EXAMPLE,
    });
  }
}

export const rule = {
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
