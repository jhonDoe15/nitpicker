//! ConditionalExpressionNumericPromotion: a conditional of two different boxed numbers that is promoted to a primitive.
use super::Context;
use super::fixes::Fix;
use super::targets::target_type;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn conditional_expression_numeric_promotion(context: &Context, node: Node) {
    if node.kind() != "ternary_expression" {
        return;
    }
    let (Some(on_true), Some(on_false)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) else { return };
    let resolver = context.resolver;
    if !matches!(resolver.type_of(node), Some(Type::Primitive(_))) {
        return;
    }
    let (Some(true_type), Some(false_type)) = (resolver.type_of(on_true), resolver.type_of(on_false)) else { return };
    if matches!(true_type, Type::Primitive(_)) || matches!(false_type, Type::Primitive(_)) || true_type.erased() == false_type.erased() {
        return;
    }
    let Some(target) = target_type(context, node) else { return };
    if matches!(target, Type::Primitive(_)) {
        return;
    }
    let index = resolver.index;
    let number = "java.lang.Number";
    if index.is_subtype(&target.name(), number) && target.name() != number {
        return;
    }
    let mut fix = Fix::new();
    let name = super::fix_helpers::qualify_type(context, node, number, &mut fix);
    let prefix = format!("(({name}) ");
    for branch in [on_true, on_false] {
        fix = fix.insert(branch.start_byte(), prefix.clone()).insert(branch.end_byte(), ")");
    }
    let at = super::positions::preferred(context, node);
    context.report_fixed("ConditionalExpressionNumericPromotion", node, at, "A conditional expression with numeric operands of differing types will perform binary numeric promotion of the operands; when these operands are of reference types, the expression's result may not be of the expected type.", &[fix]);
}
