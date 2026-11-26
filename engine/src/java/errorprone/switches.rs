//! MissingCasesInEnumSwitch: a switch on an enum that neither handles every constant nor has a default.
use super::tokens::tokens;
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::{flag, Type};
use tree_sitter::Node;

const MAX_CASES_TO_PRINT: usize = 5;

fn is_statement(switch: Node) -> bool {
    parent(switch).is_some_and(|holder| {
        matches!(
            holder.kind(),
            "block" | "constructor_body" | "switch_block_statement_group" | "if_statement" | "for_statement" | "enhanced_for_statement"
                | "while_statement" | "do_statement" | "labeled_statement" | "program" | "switch_rule"
        )
    })
}

fn is_default(label: Node) -> bool {
    children(label).into_iter().any(|part| part.kind() == "default")
}

fn cases_of(block: Node) -> Vec<Node> {
    named_children(block).into_iter().filter(|case| matches!(case.kind(), "switch_rule" | "switch_block_statement_group")).collect()
}

fn labels(block: Node) -> Vec<Node> {
    cases_of(block).into_iter().flat_map(|case| children(case).into_iter().filter(|part| part.kind() == "switch_label")).collect()
}

fn guarded(label: Node) -> bool {
    let Some(guard) = children(label).into_iter().find(|part| part.kind() == "guard") else { return false };
    let Some(mut expression) = guard.named_child(0) else { return false };
    while expression.kind() == "parenthesized_expression" {
        let Some(inner) = expression.named_child(0) else { break };
        expression = inner;
    }
    expression.kind() != "true"
}

fn pattern_type(context: &Context, label: Node) -> Option<Type> {
    let pattern = children(label).into_iter().find(|part| part.kind() == "pattern")?;
    let mut inner = pattern;
    while inner.kind() == "pattern" {
        inner = inner.named_child(0)?;
    }
    if inner.kind() != "type_pattern" {
        return None;
    }
    context.resolver.type_node(inner.named_child(0)?)
}

fn last_name<'f>(context: &'f Context, expression: Node) -> &'f str {
    let text = context.text(expression);
    text.rsplit('.').next().unwrap_or(text).trim()
}

/// A case for the skew heuristic: where it ends and where its body starts.
fn skew_default(context: &Context, switch: Node, block: Node, label: Node) -> bool {
    let cases = cases_of(block);
    let Some(group) = cases.iter().position(|case| case.start_byte() <= label.start_byte() && label.end_byte() <= case.end_byte()) else { return false };
    let group_labels: Vec<Node> = children(cases[group]).into_iter().filter(|part| part.kind() == "switch_label").collect();
    let at = group_labels.iter().position(|part| part.id() == label.id()).unwrap_or(0);
    let condition = switch.child_by_field_name("condition");
    let start = if at > 0 {
        group_labels[at - 1].end_byte()
    } else if group > 0 {
        cases[group - 1].end_byte()
    } else {
        condition.map_or(switch.start_byte(), |condition| condition.end_byte())
    };
    let body = children(cases[group]).into_iter().find(|part| !matches!(part.kind(), "switch_label" | "->" | ":" | "comment" | "line_comment" | "block_comment"));
    let end = if at + 1 < group_labels.len() {
        group_labels[at + 1].start_byte()
    } else if let Some(body) = body {
        body.start_byte()
    } else if group + 1 < cases.len() {
        cases[group + 1].start_byte()
    } else {
        switch.end_byte()
    };
    let text = &context.file.text;
    tokens(text, start, end).iter().flat_map(|token| token.comments.iter()).any(|(_, comment)| has_skew(comment))
}

fn has_skew(comment: &str) -> bool {
    let lower = comment.to_lowercase();
    lower.match_indices("skew").any(|(at, word)| {
        let before = lower[..at].chars().next_back();
        let after = lower[at + word.len()..].chars().next();
        !before.is_some_and(|c| c.is_alphanumeric() || c == '_') && !after.is_some_and(|c| c.is_alphanumeric() || c == '_')
    })
}

fn describe(unhandled: &[String], prefix: &str) -> String {
    let shown = if unhandled.len() > MAX_CASES_TO_PRINT { 3 } else { unhandled.len() };
    let mut message = format!("{prefix}: {}", unhandled[..shown].join(", "));
    if shown < unhandled.len() {
        message.push_str(&format!(", and {} others", unhandled.len() - shown));
    }
    message
}

pub fn missing_cases_in_enum_switch(context: &Context, node: Node) {
    if node.kind() != "switch_expression" {
        return;
    }
    let (Some(condition), Some(block)) = (node.child_by_field_name("condition"), node.child_by_field_name("body")) else { return };
    let Some(inner) = condition.named_child(0) else { return };
    let Some(Type::Class(name, _)) = context.resolver.type_of(inner) else { return };
    let Some(info) = context.resolver.index.get(&name) else { return };
    if info.enum_constants.is_none() {
        return;
    }
    let all_labels = labels(block);
    let default = all_labels.iter().copied().find(|label| is_default(*label));
    let statement = is_statement(node);
    let skewed = default.is_some_and(|label| skew_default(context, node, block, label));
    let prefix = if statement {
        let unconditional = all_labels.iter().any(|label| {
            !guarded(*label) && pattern_type(context, *label).is_some_and(|kind| matches!(&kind, Type::Class(of, _) if context.resolver.index.is_subtype(&name, of)))
        });
        if (default.is_some() && !skewed) || unconditional {
            return;
        }
        "Non-exhaustive switch; either add a default or handle the remaining cases"
    } else {
        if default.is_none() || !skewed {
            return;
        }
        "Non-exhaustive switch; ensure all cases are handled in addition to the default case"
    };
    let mut handled: Vec<&str> = Vec::new();
    for label in &all_labels {
        for part in named_children(*label) {
            if matches!(part.kind(), "identifier" | "field_access") {
                handled.push(last_name(context, part));
            }
        }
    }
    let unhandled: Vec<String> = info.fields.iter().filter(|field| field.flags & flag::ENUM != 0 && !handled.contains(&field.name.as_str())).map(|field| field.name.clone()).collect();
    if unhandled.is_empty() {
        return;
    }
    context.report_fixed("MissingCasesInEnumSwitch", condition, condition.start_byte(), &describe(&unhandled, prefix), &[]);
}
