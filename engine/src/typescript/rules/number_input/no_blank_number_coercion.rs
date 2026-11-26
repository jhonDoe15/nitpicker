//! `no-blank-number-coercion`: `Number("")` is 0, so text that can be blank passes an `isNaN` check as the number 0.
use super::blank_guards::{has_input_shape, is_blank_checked, is_blank_text, is_split_part, number_checks};
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::Scope;
use crate::typescript::rules::support::view::Node;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

const RULE: &str = "no-blank-number-coercion";
const NULLISH: u32 = type_flags::NULL | type_flags::UNDEFINED | type_flags::VOID;
const TEXT: u32 = type_flags::STRING | type_flags::STRING_LITERAL | type_flags::TEMPLATE_LITERAL;
const LOOSE: u32 = type_flags::ANY | type_flags::UNKNOWN | type_flags::OBJECT;

fn message(value: &str) -> String {
    format!(
        "`Number(\"\")` is 0, not NaN, so a blank `{value}` passes this check as the number 0. Reject blank text first (`if (!{value}?.trim())`), or use `Number.parseInt(..., 10)`, which gives NaN for an empty string."
    )
}

fn can_be_blank(part: &Type) -> bool {
    if part.flags & type_flags::STRING_LITERAL != 0 {
        return part.value.as_ref().and_then(|value| value.as_str()).is_none_or(is_blank_text);
    }
    part.flags & TEXT != 0
}

fn is_blankable_text(scope: &Scope, value: Node) -> bool {
    let Some(parts) = scope.types.borrow_mut().union_members_at(value.start(), value.end()) else {
        scope.types.borrow_mut().refuse("no type for a coerced value");
        return false;
    };
    let present: Vec<&Type> = parts.iter().filter(|part| part.flags & NULLISH == 0).collect();
    if !present.is_empty() && present.iter().all(|part| part.flags & (TEXT | NULLISH) != 0) {
        return present.into_iter().any(can_be_blank);
    }
    let loose = !present.is_empty() && present.iter().all(|part| part.flags & (LOOSE | TEXT) != 0);
    loose && has_input_shape(scope.source(value))
}

fn coerced_value(node: Node) -> Option<Node> {
    if node.is("CallExpression") {
        let callee = node.node("callee")?;
        let arguments = node.nodes("arguments");
        let named = callee.is("Identifier") && callee.name().as_deref() == Some("Number");
        return (named && arguments.len() == 1).then(|| arguments[0]);
    }
    (node.is("UnaryExpression") && node.text("operator").as_deref() == Some("+")).then(|| node.node("argument")).flatten()
}

fn has_text_default(node: Node) -> bool {
    if !node.is("LogicalExpression") || node.text("operator").as_deref() != Some("||") {
        return false;
    }
    let Some(right) = node.node("right").filter(|right| right.is("Literal")) else { return false };
    right.text("value").is_some_and(|text| !is_blank_text(&text))
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression") || node.is("UnaryExpression")) {
        let Some(value) = coerced_value(node).filter(|value| !value.is("SpreadElement") && !has_text_default(*value)) else { continue };
        let (checked, bounded) = number_checks(scopes, node);
        if checked && !bounded && is_blankable_text(&scope, value) && !is_blank_checked(&scope, node, value) && !is_split_part(&scope, value) {
            found.push((node.start(), node.end(), message(scope.source(value))));
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
