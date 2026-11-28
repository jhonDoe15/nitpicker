//! DoNotMock: Mockito mocks of types that are annotated `@DoNotMock`, directly or through a meta-annotation.
use super::Context;
use super::call_match::static_on_class;
use super::compat::qualified;
use super::positions::{arguments, preferred};
use crate::engine::source::children;
use crate::java::helpers::declarators;
use crate::java::types::model::Type;
use tree_sitter::Node;

const AUTO_VALUE: &str = "com.google.auto.value.AutoValue";
const AUTO_VALUE_REASON: &str = "AutoValue classes represent pure value classes, so mocking them should not be necessary";

fn rank(context: &Context, name: &str) -> usize {
    if name == "java.lang.Object" {
        return 0;
    }
    let Some(info) = context.resolver.index.get(name) else { return 1 };
    let parents = info.superclass.iter().chain(info.interfaces.iter());
    1 + parents.map(|parent| rank(context, parent)).max().unwrap_or(0)
}

fn closure(context: &Context, name: &str, into: &mut Vec<String>) {
    if into.iter().any(|known| known == name) {
        return;
    }
    into.push(name.to_string());
    if let Some(info) = context.resolver.index.get(name) {
        for parent in info.superclass.iter().chain(info.interfaces.iter()) {
            closure(context, parent, into);
        }
    }
}

fn shown(reason: &str) -> String {
    if reason.is_empty() { "It is annotated as DoNotMock.".to_string() } else { reason.to_string() }
}

/// The message for a mocked type that has a `@DoNotMock` somewhere in its supertypes.
fn forbidden(context: &Context, mocked: &Type, auto_value: bool) -> Option<String> {
    let Type::Class(name, _) = mocked else { return None };
    let mut all = Vec::new();
    closure(context, name, &mut all);
    let ranks: Vec<(usize, String)> = all.into_iter().map(|each| (rank(context, &each), each)).collect();
    let mut ordered = ranks;
    ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| b.1.cmp(&a.1)));
    let index = context.resolver.index;
    for (_, current) in ordered {
        let Some(info) = index.get(&current) else { continue };
        let base = format!("Do not mock '{}'{}", qualified(mocked), if *name == current { String::new() } else { format!(" (which is-a '{current}')") });
        let (short, reason_of): (&str, fn(&crate::java::types::model::ClassInfo) -> Option<String>) = if auto_value {
            ("AutoValue", |info| info.class_annotations.iter().any(|full| full == AUTO_VALUE).then(|| AUTO_VALUE_REASON.to_string()))
        } else {
            ("DoNotMock", |info| info.do_not_mock.as_ref().map(|reason| shown(reason)))
        };
        if let Some(reason) = reason_of(info) {
            return Some(format!("{base}; {current} is annotated as @{short}: {reason}."));
        }
        for full in &info.class_annotations {
            if let Some(reason) = index.get(full).and_then(|meta| reason_of(meta)) {
                return Some(format!("{base}; {current} is annotated as @{full} (which is annotated as @{short}): {reason}."));
            }
        }
    }
    None
}

/// The type of `outer.new Inner()`: the member class of the outer expression's type, or of one of its supertypes.
fn inner_creation(context: &Context, creation: Node) -> Option<Type> {
    if creation.kind() != "object_creation_expression" {
        return None;
    }
    let kind = creation.child_by_field_name("type")?;
    let outer = children(creation).into_iter().take_while(|part| part.kind() != "new").find(|part| part.is_named())?;
    let outer = context.resolver.type_of(outer)?;
    let written = context.text(kind).to_string();
    let index = context.resolver.index;
    let found = index.lineage(&outer.name()).iter().map(|ancestor| format!("{ancestor}.{written}")).find(|candidate| index.has(candidate))?;
    Some(Type::class(&found))
}

pub fn do_not_mock(context: &Context, node: Node) {
    mock_check(context, node, "DoNotMock", false);
}

pub fn do_not_mock_auto_value(context: &Context, node: Node) {
    mock_check(context, node, "DoNotMockAutoValue", true);
}

fn mock_check(context: &Context, node: Node, check: &'static str, auto_value: bool) {
    match node.kind() {
        "method_invocation" => {
            if !static_on_class(context, node, "org.mockito.Mockito", &["mock", "spy"]) {
                return;
            }
            let Some(first) = arguments(node).first().copied() else { return };
            let mocked = match context.resolver.type_of(first) {
                Some(Type::Class(name, given)) if name == "java.lang.Class" => match given.as_slice() {
                    [Type::Class(inner, _)] => Type::class(inner),
                    _ => return,
                },
                Some(other) => other,
                None => match inner_creation(context, first) {
                    Some(made) => made,
                    None => return,
                },
            };
            if let Some(message) = forbidden(context, &mocked, auto_value) {
                context.report_fixed(check, node, preferred(context, node), &message, &[]);
            }
        }
        "field_declaration" => {
            let names = context.resolver.annotation_names(node);
            if !names.iter().any(|name| name == "org.mockito.Mock" || name == "org.mockito.Spy") {
                return;
            }
            for declarator in declarators(node) {
                let Some(mocked) = context.resolver.declared_type(node, Some(declarator)) else { continue };
                let Some(name) = declarator.child_by_field_name("name") else { continue };
                if let Some(message) = forbidden(context, &mocked, auto_value) {
                    context.report_fixed(check, node, name.start_byte(), &message, &[]);
                }
            }
        }
        _ => {}
    }
}
