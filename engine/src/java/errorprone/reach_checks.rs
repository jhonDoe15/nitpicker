//! FallThrough, MissingDefault, SwitchDefault and ReachabilityFenceUsage: the checks built on `Reachability`.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::nodes::position;
use super::reach::{can_complete_normally, can_fall_through, case_statements, cases, is_default, is_rule, is_statement_switch, rule_body};
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MISSING_DEFAULT: &str = "The Google Java Style Guide requires that each switch statement includes a default statement group (even if it contains no code) unless the switch statement covers all values of an enum.";

/// Where javac's case tree ends: its last statement, its rule body, or the `:` after its label.
fn case_end(case: Node) -> usize {
    if let Some(last) = case_statements(case).last() {
        return last.end_byte();
    }
    if is_rule(case) {
        return rule_body(case).map_or(case.end_byte(), |body| body.end_byte());
    }
    children(case).into_iter().filter(|part| matches!(part.kind(), ":" | "switch_label")).last().map_or(case.end_byte(), |part| part.end_byte())
}

/// Where javac's case tree starts: its `case` or `default`, never a comment before it.
fn case_start(case: Node) -> usize {
    children(case).into_iter().find(|part| part.kind() == "switch_label").map_or(case.start_byte(), |label| label.start_byte())
}

fn word(character: Option<char>) -> bool {
    character.is_some_and(|value| value.is_ascii_alphanumeric() || value == '_')
}

fn ascii_at(chars: &[char], at: usize, text: &str) -> Option<usize> {
    let wanted: Vec<char> = text.chars().collect();
    (at + wanted.len() <= chars.len() && chars[at..at + wanted.len()].iter().zip(&wanted).all(|(a, b)| a.to_ascii_lowercase() == *b)).then_some(at + wanted.len())
}

/// `\bfalls?.?through\b`, case-insensitive for ASCII, as `java.util.regex` reads it.
fn mentions_fall_through(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let terminator = |value: char| matches!(value, '\n' | '\r' | '\u{85}' | '\u{2028}' | '\u{2029}');
    (0..chars.len()).any(|start| {
        if start > 0 && word(Some(chars[start - 1])) {
            return false;
        }
        let Some(after_fall) = ascii_at(&chars, start, "fall") else { return false };
        let with_s = [Some(after_fall), ascii_at(&chars, after_fall, "s")];
        with_s.into_iter().flatten().any(|at| {
            let any = (at < chars.len() && !terminator(chars[at])).then_some(at + 1);
            [any, Some(at)].into_iter().flatten().any(|at| ascii_at(&chars, at, "through").is_some_and(|end| !word(chars.get(end).copied())))
        })
    })
}

fn fall_through_end(case: Node) -> usize {
    let statements = case_statements(case);
    if let [only] = statements.as_slice() {
        if only.kind() == "block" {
            let inner: Vec<Node> = named_children(*only).into_iter().filter(|part| !matches!(part.kind(), "line_comment" | "block_comment")).collect();
            return inner.last().map_or(only.start_byte(), |last| last.end_byte());
        }
    }
    case_end(case)
}

pub fn fall_through(context: &Context, node: Node) {
    if !is_statement_switch(node) {
        return;
    }
    let all = cases(node);
    for pair in all.windows(2) {
        let (case, next) = (pair[0], pair[1]);
        let statements = case_statements(case);
        let Some(last) = statements.last() else { continue };
        let completes = can_complete_normally(context, *last);
        let comments = context.file.text[fall_through_end(case)..case_start(next)].trim();
        let mentioned = mentions_fall_through(comments);
        if completes && !mentioned {
            context.report_fixed("FallThrough", next, case_start(next), "Execution may fall through from the previous case; add a `// fall through` comment before this line if it was deliberate", &[]);
        } else if !completes && mentioned {
            context.report_fixed("FallThrough", next, case_start(next), "Switch case has 'fall through' comment, but execution cannot fall through from the previous case", &[]);
        }
    }
}

/// Whether javac requires the switch to be exhaustive: a pattern or `null` label, or a selector of a type an old
/// switch does not take.
fn enhanced(context: &Context, node: Node, all: &[Node]) -> bool {
    let labelled = all.iter().flat_map(|case| children(*case)).filter(|part| part.kind() == "switch_label").any(|label| {
        named_children(label).iter().any(|part| matches!(part.kind(), "pattern" | "type_pattern" | "record_pattern" | "guard" | "null_literal"))
    });
    if labelled {
        return true;
    }
    let Some(selector) = node.child_by_field_name("condition").and_then(|condition| condition.named_child(0)) else { return false };
    match context.resolver.type_of(selector) {
        Some(Type::Class(name, _)) => {
            !matches!(name.as_str(), "java.lang.Character" | "java.lang.Byte" | "java.lang.Short" | "java.lang.Integer" | "java.lang.String")
                && context.resolver.index.get(&name).is_some_and(|info| info.enum_constants.is_none())
        }
        _ => false,
    }
}

fn selects_enum(context: &Context, node: Node) -> bool {
    let Some(selector) = node.child_by_field_name("condition").and_then(|condition| condition.named_child(0)) else { return false };
    matches!(context.resolver.type_of(selector), Some(Type::Class(name, _)) if context.resolver.index.get(&name).is_some_and(|info| info.enum_constants.is_some()))
}

fn has_comment_between(text: &str, start: usize, end: usize) -> bool {
    let between = &text[start..end];
    between.contains("//") || between.contains("/*")
}

pub fn missing_default(context: &Context, node: Node) {
    if !is_statement_switch(node) || selects_enum(context, node) {
        return;
    }
    let all = cases(node);
    let Some(default) = all.iter().copied().find(|case| is_default(context, *case)) else {
        if enhanced(context, node, &all) {
            return;
        }
        let mut fixes = Vec::new();
        if let Some(last) = all.last() {
            let statements = case_statements(*last);
            let replacement = if all.iter().all(|case| is_rule(*case)) {
                "\ndefault -> {}\n"
            } else if statements.last().is_none_or(|statement| can_complete_normally(context, *statement)) {
                "\nbreak;\ndefault: // fall out\n"
            } else {
                "\ndefault: // fall out\n"
            };
            fixes.push(Fix::new().insert(case_end(*last), replacement));
        }
        context.report_fixed("MissingDefault", node, node.start_byte(), MISSING_DEFAULT, &fixes);
        return;
    };
    if is_rule(default) || !case_statements(default).is_empty() || all.last().is_none_or(|last| last.id() != default.id()) {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    if has_comment_between(&context.file.text, case_end(default), body.end_byte()) {
        return;
    }
    let fix = Fix::new().insert(case_end(default), " // fall out");
    context.report_fixed("MissingDefault", default, case_start(default), "Default case should be documented with a comment", &[fix]);
}

fn empty(case: Node) -> bool {
    case_statements(case).is_empty()
}

pub fn switch_default(context: &Context, node: Node) {
    if !is_statement_switch(node) {
        return;
    }
    let all = cases(node);
    let Some(default) = all.iter().copied().find(|case| is_default(context, *case)) else { return };
    let mut group: Vec<Node> = Vec::new();
    let mut at = 0;
    while at < all.len() {
        let mut case = all[at];
        at += 1;
        group.push(case);
        if is_default(context, case) {
            while at < all.len() && empty(case) {
                case = all[at];
                at += 1;
                group.push(case);
            }
            break;
        }
        if !empty(case) {
            group.clear();
        }
    }
    let Some(index) = group.iter().position(|case| case.id() == default.id()) else { return };
    let text = context.file.text.as_str();
    let last_of_group = *group.last().unwrap();
    let mut fix = Fix::new();
    if at < all.len() {
        if !can_fall_through(context, last_of_group) {
            let start = case_start(group[0]);
            let end = case_end(last_of_group);
            let mut replacement = if index != group.len() - 1 {
                let body_start = case_statements(last_of_group).first().map_or(end, |first| first.start_byte());
                let (cut_start, cut_end) = (case_start(default), case_end(default));
                format!("{}{}\n{}{}", &text[start..cut_start], &text[cut_end..body_start], &text[cut_start..cut_end], &text[body_start..end])
            } else {
                text[start..end].to_string()
            };
            let last = *all.last().unwrap();
            if is_default(context, last) || can_fall_through(context, last) {
                replacement = format!("break;\n{replacement}");
            }
            fix = Fix::replace(start, end, "").insert(case_end(last), replacement);
        }
    } else if index != group.len() - 1 {
        let shown = &text[case_start(default)..case_end(default)];
        fix = Fix::new().delete(case_start(default), case_end(default));
        fix = match case_statements(last_of_group).first() {
            Some(first) => fix.insert(first.start_byte(), shown),
            None => fix.insert(case_end(last_of_group), shown),
        };
    } else {
        return;
    }
    let fixes: Vec<Fix> = if fix.is_empty() { Vec::new() } else { vec![fix] };
    context.report_fixed("SwitchDefault", group[0], case_start(group[0]), "The default case of a switch should appear at the end of the last statement group", &fixes);
}

pub fn reachability_fence_usage(context: &Context, node: Node) {
    if !static_on_class(context, node, "java.lang.ref.Reference", &["reachabilityFence"]) {
        return;
    }
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "finally_clause" => return,
            "class_body" | "enum_body" | "interface_body" | "record_declaration" | "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression" | "annotation_type_body" => break,
            _ => {}
        }
        current = parent(at);
    }
    context.report_fixed("ReachabilityFenceUsage", node, position(node), "reachabilityFence should always be called inside a finally block", &[]);
}
