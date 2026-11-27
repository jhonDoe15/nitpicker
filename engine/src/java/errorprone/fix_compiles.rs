//! StaticMockMember and MutableGuiceModule: Error Prone offers their fix only when the compile still succeeds with it
//! (`SuggestedFixes.compilesWithFix`), which the engine answers from how the run's code uses the field.
use super::Context;
use super::fix_helpers::{add_modifiers, remove_modifiers};
use super::fixes::Fix;
use super::guice::has_annotation;
use crate::engine::source::{named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::field_uses::{OUTSIDE_WRITE, STATIC_USE, UNKNOWN};
use tree_sitter::Node;

const MOCK_MESSAGE: &str = "@Mock members of test classes shouldn't share state between tests and preferably be non-static";

fn names<'t>(context: &Context, field: Node<'t>) -> Vec<(Node<'t>, String)> {
    declarators(field).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")).map(|name| (name, context.text(name).to_string())).collect()
}

fn owner(context: &Context, field: Node) -> Option<String> {
    crate::java::types::scope::enclosing_types(context.resolver.scope, field).into_iter().next()
}

fn uses(context: &Context, class: &str, name: &str) -> u8 {
    context.project.field_uses.get(&(class.to_string(), name.to_string())).copied().unwrap_or_default()
}

fn statements(block: Node) -> Vec<Node> {
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn body_kind<'t>(field: Node<'t>) -> &'t str {
    parent(field).map_or("", |body| body.kind())
}

pub fn static_mock_member(context: &Context, field: Node) {
    if !matches!(field.kind(), "field_declaration" | "constant_declaration") || !has_modifier(field, "static") {
        return;
    }
    if !has_annotation(context, field, &["org.mockito.Mock"]) {
        return;
    }
    let Some(class) = owner(context, field) else { return };
    let declared = names(context, field);
    let compiles = match body_kind(field) {
        "interface_body" | "annotation_type_body" => true,
        _ if parent(field).and_then(parent).is_some_and(|declaration| declaration.kind() == "record_declaration") => false,
        _ if declared.iter().any(|(_, name)| uses(context, &class, name) & UNKNOWN != 0) => {
            for (name, _) in &declared {
                context.report_fixed("StaticMockMember", field, name.start_byte(), MOCK_MESSAGE, &[]);
            }
            context.hand_back("StaticMockMember", field);
            return;
        }
        _ => declared.iter().all(|(_, name)| uses(context, &class, name) & STATIC_USE == 0),
    };
    let fixes = if compiles { vec![remove_modifiers(Fix::new(), field, &["static"])] } else { Vec::new() };
    for (name, _) in &declared {
        context.report_fixed("StaticMockMember", field, name.start_byte(), MOCK_MESSAGE, &fixes);
    }
}

/// Whether the field, made final, is assigned exactly once: the engine reads only constructors and instance
/// initializers that assign it in a statement of their own; `None` when it cannot tell.
fn assigned_once(context: &Context, field: Node, class_body: Node, name: &str) -> Option<bool> {
    let mentions = |node: Node| -> usize {
        let mut count = 0;
        crate::engine::source::walk(node, |part| count += usize::from(super::fix_compiles_writes::refers(context, part, name)));
        count
    };
    let assigns = |statement: Node| super::fix_compiles_writes::assigns(context, statement, name) && mentions(statement) == 1;
    let mut initialized = 0;
    let mut constructors = Vec::new();
    for member in named_children(class_body) {
        match member.kind() {
            "block" => {
                let own = statements(member).into_iter().filter(|statement| assigns(*statement)).count();
                if mentions(member) != own {
                    return None;
                }
                initialized += own;
            }
            "constructor_declaration" => constructors.push(member),
            "field_declaration" | "static_initializer" if member.id() != field.id() && mentions(member) > 0 => return None,
            _ => {}
        }
    }
    let settled = |count: usize| match count {
        1 => Some(true),
        0 => Some(false),
        _ => None,
    };
    if constructors.is_empty() {
        return settled(initialized);
    }
    let mut answer = Some(true);
    for constructor in constructors {
        let body = constructor.child_by_field_name("body")?;
        let parts = statements(body);
        if parts.first().is_some_and(|first| first.kind() == "explicit_constructor_invocation" && context.text(*first).starts_with("this")) {
            if mentions(body) > 0 {
                return None;
            }
            continue;
        }
        let own: Vec<usize> = parts.iter().enumerate().filter(|(_, statement)| assigns(**statement)).map(|(at, _)| at).collect();
        let Some(&first) = own.first() else {
            if mentions(body) > 0 || !super::reach::can_complete_normally(context, body) {
                return None;
            }
            answer = answer.and(settled(initialized));
            continue;
        };
        let later_writes = parts[first + 1..].iter().any(|statement| super::fix_compiles_writes::writes(context, *statement, name));
        if own.len() != 1 || initialized != 0 || later_writes {
            return Some(false);
        }
        let earlier = &parts[..first];
        if earlier.iter().any(|statement| super::fix_compiles_writes::mentioned_directly(context, *statement, name)) {
            return Some(false);
        }
        if earlier.iter().any(|statement| mentions(*statement) > 0) {
            return None;
        }
    }
    answer
}

/// Whether adding `final` compiles: `None` when the engine cannot tell.
fn final_compiles(context: &Context, field: Node, declarator: Node, class: &str, name: &str) -> Option<bool> {
    let flags = uses(context, class, name);
    if flags & UNKNOWN != 0 {
        return None;
    }
    if flags & OUTSIDE_WRITE != 0 || has_modifier(field, "volatile") {
        return Some(false);
    }
    if declarator.child_by_field_name("value").is_some() {
        return Some(!super::fix_compiles_writes::writes(context, parent(field)?, name));
    }
    assigned_once(context, field, parent(field)?, name)
}

pub fn mutable_guice_module(context: &Context, field: Node) {
    if field.kind() != "field_declaration" || has_modifier(field, "static") || context.test_only() {
        return;
    }
    let Some(class) = owner(context, field) else { return };
    if !context.resolver.index.is_subtype(&class, "com.google.inject.AbstractModule") {
        return;
    }
    let mut answer = Some(true);
    for declarator in declarators(field) {
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        answer = match final_compiles(context, field, declarator, &class, context.text(name)) {
            Some(false) => Some(false),
            found => answer.and(found),
        };
        if answer == Some(false) {
            break;
        }
    }
    for declarator in declarators(field) {
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        if !has_modifier(field, "final") {
            let fixes = if answer == Some(true) { vec![add_modifiers(Fix::new(), field, &["final"])] } else { Vec::new() };
            context.report_fixed("MutableGuiceModule", field, name.start_byte(), "Fields in Guice modules should be final", &fixes);
            if answer.is_none() {
                context.hand_back("MutableGuiceModule", field);
            }
        }
        if let Some(shown) = super::fix_compiles_writes::known_mutable(context, field, declarator) {
            let message = format!("Fields in Guice modules should be immutable, but {shown} is mutable");
            context.report("MutableGuiceModule", field, name.start_byte(), &message);
        }
    }
}
