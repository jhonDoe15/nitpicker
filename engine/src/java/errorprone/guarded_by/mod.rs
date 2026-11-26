//! GuardedBy: accesses to fields and methods with `@GuardedBy` annotations without the lock held, and annotations
//! whose lock expression cannot be resolved.
mod bind;
mod check;
mod lock;
mod release;
mod scan;

use self::bind::tree_env::TreeEnv;
use self::check::{Shared, field_env, invalid, method_env};
use self::lock::Held;
use self::release::{monitor_guard, runs_immediately};
use self::scan::Scanner;
use super::nodes::name_position;
use super::Context;
use crate::engine::source::{children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

fn analyze<'t>(context: &Context<'t>, shared: &Shared<'t>, start: Node<'t>, from: Node<'t>) {
    let Some(this_class) = enclosing_type(context.file, context.resolver.scope, start) else { return };
    let env = TreeEnv { context, shared, this_class };
    let held = monitor_guard(context, &env, start).map_or_else(Held::default, |lock| Held::default().plus(lock));
    Scanner { context, shared, env }.scan(from, &held);
}

fn validate_method<'t>(context: &Context<'t>, shared: &Shared<'t>, method: Node<'t>) {
    let guards = context.resolver.guard_values(method);
    if guards.is_empty() {
        return;
    }
    let Some(env) = method_env(context, method) else { return };
    if let Some(problem) = invalid(&env, &guards, has_modifier(method, "static")) {
        shared.report(context, method, name_position(method), &format!("Invalid @GuardedBy expression: {problem}"));
    }
}

fn validate_field<'t>(context: &Context<'t>, shared: &Shared<'t>, declaration: Node<'t>) {
    let guards = context.resolver.guard_values(declaration);
    if guards.is_empty() {
        return;
    }
    let Some(class) = enclosing_type(context.file, context.resolver.scope, declaration) else { return };
    let named: Vec<(Node, Option<Node>)> = match declaration.kind() {
        "enum_constant" => vec![(declaration, None)],
        _ => declarators(declaration).into_iter().map(|declarator| (declarator, Some(declarator))).collect(),
    };
    for (holder, declarator) in named {
        let Some(name) = holder.child_by_field_name("name") else { continue };
        let ty = context.resolver.declared_type(declaration, declarator).map(|kind| kind.erased());
        let env = field_env(context, class.clone(), context.text(name), declaration, ty);
        let is_static = has_modifier(declaration, "static") || matches!(declaration.kind(), "constant_declaration" | "enum_constant");
        if let Some(problem) = invalid(&env, &guards, is_static) {
            shared.report(context, holder, name.start_byte(), &format!("Invalid @GuardedBy expression: {problem}"));
        }
    }
}

fn validate_components<'t>(context: &Context<'t>, shared: &Shared<'t>, record: Node<'t>) {
    let Some(class) = context.resolver.scope.names.get(&record.id()).cloned() else { return };
    let listed = record.child_by_field_name("parameters").map(children).unwrap_or_default();
    for component in listed.into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")) {
        let exprs = context.resolver.guard_exprs(component);
        if exprs.is_empty() {
            continue;
        }
        let guards = context.resolver.index.guard_texts(&class, &exprs);
        let declarator = children(component).into_iter().find(|part| part.kind() == "variable_declarator");
        let Some(name) = declarator.unwrap_or(component).child_by_field_name("name") else { continue };
        let ty = context.resolver.declared_type(component, None).map(|kind| kind.erased());
        let env = field_env(context, class.clone(), context.text(name), component, ty);
        if let Some(problem) = invalid(&env, &guards, false) {
            shared.report(context, component, name.start_byte(), &format!("Invalid @GuardedBy expression: {problem}"));
        }
    }
}

pub fn guarded_by(context: &Context, root: Node) {
    let shared = Shared::new();
    walk(root, |node| match node.kind() {
        "method_declaration" | "annotation_type_element_declaration" => {
            analyze(context, &shared, node, node);
            validate_method(context, &shared, node);
        }
        "lambda_expression" => {
            if !runs_immediately(context, node) {
                if let Some(body) = node.child_by_field_name("body") {
                    analyze(context, &shared, node, body);
                }
            }
        }
        "method_reference" => {
            if !runs_immediately(context, node) {
                analyze(context, &shared, node, node);
            }
        }
        "field_declaration" | "constant_declaration" | "enum_constant" => validate_field(context, &shared, node),
        "record_declaration" => validate_components(context, &shared, node),
        _ => {}
    });
}
