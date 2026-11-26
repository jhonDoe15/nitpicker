//! OverridesJavaxInjectableMethod and RefersToDaggerCodegen.
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::inject_checks::{annotation_class, annotations_of};
use super::owners::is_descendant;
use super::parts::preferred;
use super::shape::is_class;
use super::Context;
use crate::engine::source::{named_children, parent};
use tree_sitter::Node;

const GUICE_INJECT: &str = "com.google.inject.Inject";
const JAVAX_INJECT: &str = "javax.inject.Inject";

pub fn overrides_javax_injectable_method(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let injected = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
    if annotations_of(node).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|class| injected.contains(&class.as_str()))) {
        return;
    }
    let Some((origin, method)) = declared_method(context, node) else { return };
    let mut found_javax = false;
    for (_, above) in super_methods(context.resolver.index, origin, method) {
        if above.detail.annotations.iter().any(|name| name == GUICE_INJECT) {
            return;
        }
        found_javax |= above.detail.annotations.iter().any(|name| name == JAVAX_INJECT);
    }
    if found_javax {
        let fix = Fix::new().insert(node.start_byte(), "@Inject\n").with_imports();
        let message = "This method is not annotated with @Inject, but it overrides a method that is  annotated with @javax.inject.Inject. The method will not be Injected.";
        let at = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
        context.report_fixed("OverridesJavaxInjectableMethod", node, at, message, &[fix]);
    }
}

const INTERNAL_PACKAGES: [&str; 4] = ["dagger.internal", "dagger.producers.internal", "dagger.producers.monitoring.internal", "dagger.android.internal"];
const GENERATED_BASES: [&str; 2] = ["dagger.internal.Factory", "dagger.producers.internal.AbstractProducer"];
const DAGGER_1_BASES: [&str; 2] = ["dagger.internal.Binding", "dagger.internal.ModuleAdapter"];

fn outermost(context: &Context, class: &str) -> String {
    let index = context.resolver.index;
    let mut name = class;
    while let Some((outer, _)) = name.rsplit_once('.') {
        if !index.has(outer) {
            break;
        }
        name = outer;
    }
    name.to_string()
}

/// What the `@Generated` annotations of a class say: their `value` strings, or the annotation's own name.
pub(super) fn generated_by(context: &Context, class: Node) -> Vec<String> {
    let mut found = Vec::new();
    for annotation in annotations_of(class) {
        let Some(written) = annotation.child_by_field_name("name").map(|name| context.text(name)) else { continue };
        let resolved = annotation_class(context, annotation).unwrap_or_else(|| written.to_string());
        if resolved.rsplit('.').next() != Some("Generated") {
            continue;
        }
        let pairs: Vec<Node> = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let value = pairs.iter().find_map(|pair| match pair.kind() {
            "element_value_pair" => pair.child_by_field_name("key").filter(|key| context.text(*key) == "value").and_then(|_| pair.child_by_field_name("value")),
            _ => None,
        });
        let single = pairs.first().filter(|pair| pair.kind() != "element_value_pair" && !pair.kind().ends_with("comment")).copied();
        match value.or(single) {
            Some(value) => {
                let mut strings = Vec::new();
                crate::engine::source::walk(value, |part| {
                    if part.kind() == "string_literal" {
                        strings.extend(crate::java::types::expr::literal_text(context.file, part));
                    }
                });
                found.extend(strings);
            }
            None => found.push(resolved),
        }
    }
    found
}

fn allowed_to_refer(context: &Context, node: Node) -> bool {
    let mut top = None;
    let mut current = parent(node);
    while let Some(at) = current {
        if is_class(at) {
            top = Some(at);
        }
        current = parent(at);
    }
    let Some(top) = top else { return false };
    let Some(name) = context.resolver.scope.names.get(&top.id()) else { return false };
    if name.starts_with("dagger.") {
        return true;
    }
    let generated = generated_by(context, top);
    if !generated.is_empty() {
        return generated.iter().any(|by| by == "dagger.internal.codegen.ComponentProcessor");
    }
    if is_descendant(context, name, &DAGGER_1_BASES) {
        return true;
    }
    is_descendant(context, name, &["dagger.MembersInjector"]) && name.rsplit('.').next().is_some_and(|simple| simple.contains("$$ParentAdapter"))
}

pub fn refers_to_dagger_codegen(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let root = outermost(context, &resolved.declaring);
    let generated_factory = is_descendant(context, &root, &GENERATED_BASES);
    let members_injection = resolved.method.name != "injectMembers" && is_descendant(context, &root, &["dagger.MembersInjector"]);
    let internal = context.resolver.index.get(&root).is_some_and(|info| INTERNAL_PACKAGES.contains(&info.package.as_str()));
    if !(generated_factory || members_injection || internal) || allowed_to_refer(context, node) {
        return;
    }
    context.report_fixed("RefersToDaggerCodegen", node, preferred(node), "Don't refer to Dagger's internal or generated code", &[]);
}
