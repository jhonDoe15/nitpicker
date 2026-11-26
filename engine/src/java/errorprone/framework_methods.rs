//! UnnecessarilyVisible, UnnecessaryTestMethodPrefix, DoNotClaimAnnotations and UnsafeFinalization.
use super::consts::{constant, Const};
use super::fix_helpers::remove_modifiers;
use super::fixes::Fix;
use super::hierarchy::{declared_method, has_annotation, overrides};
use super::lookup::field_of;
use super::nodes::name_position;
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const INJECT: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const FRAMEWORK: [&str; 10] = [
    "com.google.inject.Inject",
    "javax.inject.Inject",
    "jakarta.inject.Inject",
    "com.google.inject.Provides",
    "dagger.Provides",
    "com.google.inject.multibindings.ProvidesIntoMap",
    "com.google.inject.multibindings.ProvidesIntoSet",
    "com.google.inject.multibindings.ProvidesIntoOptional",
    "com.google.errorprone.refaster.annotation.AfterTemplate",
    "com.google.errorprone.refaster.annotation.BeforeTemplate",
];

pub fn unnecessarily_visible(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration") {
        return;
    }
    if !has_modifier(method, "public") && !has_modifier(method, "protected") {
        return;
    }
    let present = context.resolver.annotation_names(method);
    let found: Vec<&str> = FRAMEWORK.iter().copied().filter(|name| present.iter().any(|annotation| annotation == name)).collect();
    if found.is_empty() || method.kind() == "method_declaration" && overrides(context, method) || has_annotation(context, method, "VisibleForTesting") {
        return;
    }
    let mut message = "Some methods (such as those annotated with @Inject or @Provides) are only intended to be called by a framework, and so should have default visibility.".to_string();
    if found.iter().any(|name| INJECT.contains(name)) {
        message.push_str(" If this is only for testing purposes, consider annotating the element with @VisibleForTesting.");
    }
    let fix = remove_modifiers(Fix::new(), method, &["public", "protected"]);
    context.report_fixed("UnnecessarilyVisible", method, name_position(method), &message, &[fix]);
}

pub fn unnecessary_test_method_prefix(context: &Context, root: Node) {
    let mut sites: Vec<Node> = Vec::new();
    walk(root, |node| {
        if node.kind() != "method_declaration" || context.suppressed("UnnecessaryTestMethodPrefix", node) {
            return;
        }
        let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
        if !name.starts_with("test") || name == "test" || !context.resolver.annotation_names(node).iter().any(|annotation| annotation == "org.junit.Test") {
            return;
        }
        sites.push(node);
    });
    let mut fix = Fix::new();
    for site in &sites {
        let Some(name) = site.child_by_field_name("name") else { return };
        let text = context.text(name);
        let mut rest = text[4..].chars();
        let replacement = match rest.next() {
            Some(first) => format!("{}{}", first.to_ascii_lowercase(), rest.as_str()),
            None => String::new(),
        };
        fix = fix.and(name.start_byte(), name.end_byte(), replacement);
    }
    for site in sites {
        context.report_always_fixed(
            "UnnecessaryTestMethodPrefix",
            name_position(site),
            "A `test` prefix for a JUnit4 test is redundant, and a holdover from JUnit3. The `@Test` annotation makes it clear it's a test.",
            std::slice::from_ref(&fix),
        );
    }
}

fn collect_returns<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    for part in children(node) {
        match part.kind() {
            "lambda_expression" | "class_declaration" | "class_body" | "enum_declaration" | "record_declaration" | "interface_declaration" => {}
            "return_statement" => {
                found.push(part);
                collect_returns(part, found);
            }
            _ => collect_returns(part, found),
        }
    }
}

pub fn do_not_claim_annotations(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("name").is_none_or(|name| context.text(name) != "process") {
        return;
    }
    let Some((info, declared)) = declared_method(context, method) else { return };
    if declared.returns != Type::Primitive("boolean") || declared.parameters.len() != 2 {
        return;
    }
    if declared.parameters[0].name() != "java.util.Set" || declared.parameters[1].name() != "javax.annotation.processing.RoundEnvironment" {
        return;
    }
    if !context.resolver.index.is_subtype(&info.name, "javax.annotation.processing.Processor") {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    let mut returns = Vec::new();
    collect_returns(body, &mut returns);
    let value = |statement: Node| statement.named_child(0).and_then(|expression| match constant(context, expression) {
        Some(Const::Bool(flag)) => Some(flag),
        _ => None,
    });
    returns.retain(|statement| value(*statement) != Some(false));
    let Some(first) = returns.first().copied() else { return };
    let mut fix = Fix::new();
    for statement in &returns {
        if let (Some(true), Some(expression)) = (value(*statement), statement.named_child(0)) {
            fix = fix.and(expression.start_byte(), expression.end_byte(), "false");
        }
    }
    let message = "Don't 'claim' annotations in annotation processors; Processor#process should unconditionally return `false`";
    context.report_fixed("DoNotClaimAnnotations", first, first.start_byte(), message, &[fix]);
}

/// The method or constructor a call stands in, as `ASTHelpers.findEnclosingMethod` finds it.
fn enclosing_method_tree(call: Node) -> Option<Node> {
    let mut current = parent(call);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => return Some(at),
            "class_declaration" | "lambda_expression" => return None,
            "class_body" if parent(at).is_some_and(|owner| owner.kind() == "object_creation_expression") => return None,
            _ => {}
        }
        current = parent(at);
    }
    None
}

fn member_of(context: &Context, class: &str, owner: &str, private: bool) -> bool {
    class == owner || !private && context.resolver.index.lineage(class).iter().any(|ancestor| ancestor == owner)
}

pub fn unsafe_finalization(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if !resolved.method.is_static || resolved.method.detail.access & 0x100 == 0 {
        return;
    }
    let Some(method) = enclosing_method_tree(call) else { return };
    if method.kind() != "method_declaration" || has_modifier(method, "static") {
        return;
    }
    let Some(class) = super::parts::enclosing_class(context, call) else { return };
    let list = arguments(call);
    let mut instance_state = false;
    for argument in &list {
        let Some((owner, field)) = field_of(context, *argument) else { continue };
        let integral = matches!(field.kind.clone().unboxed_or_same(), Type::Primitive("int" | "long"));
        instance_state |= integral && member_of(context, &class, &owner.name, field.is_private);
    }
    if !instance_state || list.iter().any(|argument| argument.kind() == "this") {
        return;
    }
    let index = context.resolver.index;
    let lineage = index.lineage(&class);
    let finalizer_field = lineage.iter().filter_map(|name| index.get(name)).any(|info| info.fields.iter().any(|field| field.kind == Type::class("com.google.common.labs.base.Finalizer")));
    if !finalizer_field {
        let Some(owner) = lineage.iter().find(|name| index.get(name).is_some_and(|info| info.methods.iter().any(|candidate| candidate.name == "finalize" && candidate.parameters.is_empty() && (**name == class || !candidate.is_private)))) else { return };
        let own = declared_method(context, method).is_some_and(|(_, declared)| declared.name == "finalize" && declared.parameters.is_empty());
        if *owner == "java.lang.Object" || *owner == class && own {
            return;
        }
    }
    let mut fenced = false;
    walk(context.file.tree.root_node(), |node| {
        if node.kind() == "method_invocation" && super::call_match::static_on_class(context, node, "java.lang.ref.Reference", &["reachabilityFence"]) {
            fenced = true;
        }
    });
    if fenced {
        return;
    }
    context.report_fixed("UnsafeFinalization", call, preferred(context, call), "Finalizer may run before native code finishes execution", &[]);
}
