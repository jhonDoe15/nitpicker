//! Reference equality of boxed primitives, and the fixes AbstractReferenceEquality offers.
use super::consts::constant;
use super::fixes::Fix;
use super::operators::operator;
use super::parts::arguments;
use super::qualify::qualify;
use super::Context;
use super::symbol_key::same_symbol as same_variable;
use crate::engine::source::parent;
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

const BOXED: &str = "Comparison using reference equality instead of value equality. Reference equality of boxed primitive types is usually not useful, as they are value objects, and it is bug-prone, as instances are cached for some values but not others.";

fn boxed(context: &Context, operand: Node) -> bool {
    match context.resolver.type_of(operand) {
        Some(kind @ Type::Class(..)) => matches!(kind.unboxed_or_same(), Type::Primitive(_)),
        _ => false,
    }
}

const NON_NULL_CLASSES: [&str; 9] = [
    "com.google.common.base.Optional", "com.google.common.base.Preconditions", "com.google.common.base.Verify", "java.lang.String",
    "java.math.BigInteger", "java.math.BigDecimal", "com.google.common.primitives.UnsignedInteger", "com.google.common.primitives.UnsignedLong", "java.util.Objects",
];
const VALUE_OF: [&str; 10] = [
    "java.lang.Boolean", "java.lang.Byte", "java.lang.Character", "java.lang.Double", "java.lang.Float", "java.lang.Integer", "java.lang.Long",
    "java.lang.Short", "java.lang.Enum", "java.lang.String",
];

/// Whether the nullness analysis knows the expression is never null, as far as its shape and the callee tell.
pub fn known_non_null(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    match expression.kind() {
        "object_creation_expression" | "string_literal" | "this" | "lambda_expression" | "method_reference" | "array_creation_expression" => true,
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal"
        | "hex_floating_point_literal" | "character_literal" | "true" | "false" => true,
        "binary_expression" | "instanceof_expression" | "unary_expression" | "update_expression" => true,
        "class_literal" => true,
        "identifier" => super::flow_nullness::non_null_variable(context, expression),
        "method_invocation" => {
            let Some(call) = context.resolver.resolve_call(expression) else { return false };
            if matches!(call.method.returns, Type::Primitive(_)) {
                return true;
            }
            let name = call.method.name.as_str();
            let owner = call.declaring.as_str();
            (name == "valueOf" && VALUE_OF.contains(&owner)) || NON_NULL_CLASSES.contains(&owner) || (owner == "java.lang.Class" && matches!(name, "getName" | "getSimpleName" | "forName"))
        }
        _ => false,
    }
}

fn pair_matches<'t>(context: &Context<'t>, first: Node<'t>, second: Node<'t>, lhs: Node<'t>, rhs: Node<'t>) -> bool {
    (same_variable(context, first, lhs) && same_variable(context, second, rhs)) || (same_variable(context, first, rhs) && same_variable(context, second, lhs))
}

fn or_statement_fix(context: &Context, tree: Node, lhs: Node, rhs: Node) -> Option<Fix> {
    if context.text(operator(tree)?) != "==" {
        return None;
    }
    let above = parent(tree).filter(|above| above.kind() == "binary_expression" && operator(*above).is_some_and(|op| context.text(op) == "||"))?;
    if above.child_by_field_name("left")?.id() != tree.id() {
        return None;
    }
    let other = unwrap(above.child_by_field_name("right")?);
    if other.kind() != "method_invocation" {
        return None;
    }
    let args = arguments(other);
    let name = super::parts::name_text(context, other);
    let replacement = || Fix::replace(above.start_byte(), above.end_byte(), context.text(other));
    let is_static = |signature: &str| context.resolver.matches_sig(other, signature) && context.resolver.resolve_call(other).is_some_and(|call| call.method.is_static);
    let returns_boolean = context.resolver.resolve_call(other).is_some_and(|call| call.method.returns == Type::Primitive("boolean"));
    if returns_boolean && args.len() == 2 && ((name == "equals" && is_static("java.util.Objects#equals(java.lang.Object,java.lang.Object)")) || (name == "equal" && is_static("com.google.common.base.Objects#equal(java.lang.Object,java.lang.Object)"))) && pair_matches(context, args[0], args[1], lhs, rhs) {
        return Some(replacement());
    }
    if returns_boolean && args.len() == 1 && name == "equals" && context.resolver.matches_sig(other, "_#equals(java.lang.Object)") {
        let receiver = other.child_by_field_name("object")?;
        if pair_matches(context, receiver, args[0], lhs, rhs) {
            return Some(replacement());
        }
    }
    None
}

/// The fixes of `AbstractReferenceEquality.addFixes`.
pub fn equality_fixes(context: &Context, tree: Node) -> Vec<Fix> {
    let (Some(mut lhs), Some(mut rhs), Some(op)) = (tree.child_by_field_name("left"), tree.child_by_field_name("right"), operator(tree)) else { return Vec::new() };
    if let Some(fix) = or_statement_fix(context, tree, lhs, rhs) {
        return vec![fix];
    }
    if constant(context, lhs).is_none() && constant(context, rhs).is_some() {
        std::mem::swap(&mut lhs, &mut rhs);
    }
    let prefix = if context.text(op) == "!=" { "!" } else { "" };
    let (left, right) = (context.text(lhs), context.text(rhs));
    let (start, end) = (tree.start_byte(), tree.end_byte());
    let non_null = known_non_null(context, lhs);
    let mut fixes = Vec::new();
    if !non_null {
        let objects = qualify(context, tree, "java.util.Objects");
        fixes.push(Fix::replace(start, end, format!("{prefix}{objects}.equals({left}, {right})")).with_imports());
    }
    let shown = if lhs.kind() == "binary_expression" { format!("({left})") } else { left.to_string() };
    fixes.push(Fix::replace(start, end, format!("{prefix}{shown}.equals({right})")));
    fixes
}

pub fn boxed_primitive_equality(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(op) = operator(node).filter(|op| matches!(context.text(*op), "==" | "!=")) else { return };
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if left.kind() == "null_literal" || right.kind() == "null_literal" || !boxed(context, left) || !boxed(context, right) {
        return;
    }
    let fixes = equality_fixes(context, node);
    context.report_fixed("BoxedPrimitiveEquality", node, op.start_byte(), BOXED, &fixes);
}
