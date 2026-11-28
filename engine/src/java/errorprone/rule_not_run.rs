//! RuleNotRun: a JUnit `TestRule` field that is no `@Rule`, and that nothing else uses.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::hierarchy::annotation_names;
use super::junit_init::{is_junit4_test_class_of_any_kind, members};
use super::symbol_key::{SymbolKey, declared_key, reference_key};
use crate::engine::source::{named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::javac::locals::is_use;
use crate::java::types::model::Type;
use tree_sitter::Node;

const STOP_ANNOTATIONS: [&str; 4] = ["ClassRule", "Inject", "Rule", "TightRule"];

fn is_rule(context: &Context, field: Node, declarator: Node) -> bool {
    if has_modifier(field, "private") || annotation_names(context, field).iter().any(|name| STOP_ANNOTATIONS.contains(&name.rsplit('.').next().unwrap_or(name))) {
        return false;
    }
    matches!(context.resolver.declared_type(field, Some(declarator)), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "org.junit.rules.TestRule"))
}

fn qualifier_of_member_select(node: Node) -> bool {
    parent(node).is_some_and(|up| matches!(up.kind(), "field_access" | "method_invocation") && up.child_by_field_name("object") == Some(node))
}

pub fn rule_not_run(context: &Context, root: Node) {
    let mut rules: Vec<(Node, SymbolKey, String)> = Vec::new();
    for class in named_children(root).into_iter().filter(|part| super::shape::is_class(*part) || matches!(part.kind(), "annotation_type_declaration")) {
        if context.suppressed("RuleNotRun", class) || !is_junit4_test_class_of_any_kind(context, class) {
            continue;
        }
        for field in members(class).into_iter().filter(|member| member.kind() == "field_declaration") {
            for declarator in declarators(field) {
                if context.suppressed("RuleNotRun", declarator) || !is_rule(context, field, declarator) {
                    continue;
                }
                let Some(key) = declared_key(context, declarator) else { continue };
                let Some(name) = declarator.child_by_field_name("name") else { continue };
                rules.push((declarator, key, context.text(name).to_string()));
            }
        }
    }
    if rules.is_empty() {
        return;
    }
    let mut remaining: Vec<bool> = vec![true; rules.len()];
    walk(root, |node| {
        let written = match node.kind() {
            "identifier" if is_use(node) => context.text(node),
            "field_access" => match node.child_by_field_name("field") {
                Some(field) => context.text(field),
                None => return,
            },
            _ => return,
        };
        if qualifier_of_member_select(node) || !rules.iter().any(|(_, _, name)| name == written) {
            return;
        }
        let Some(found) = reference_key(context, node) else { return };
        for (at, (_, key, _)) in rules.iter().enumerate() {
            if *key == found {
                remaining[at] = false;
            }
        }
    });
    for ((declarator, _, _), keep) in rules.iter().zip(remaining) {
        if !keep {
            continue;
        }
        let Some(field) = parent(*declarator) else { continue };
        let mut fix = Fix::new();
        let rule = qualify_type(context, field, "org.junit.Rule", &mut fix);
        let fix = fix.insert(field.start_byte(), format!("@{rule} "));
        let at = declarator.child_by_field_name("name").map_or(declarator.start_byte(), |name| name.start_byte());
        context.report_fixed("RuleNotRun", *declarator, at, "This TestRule isn't annotated with @Rule, so won't be run.", &[fix]);
    }
}
