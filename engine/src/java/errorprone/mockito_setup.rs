//! MockIllegalThrows and MockitoDoSetup.
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::locale_fix::qualify_static_import;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, name_text, preferred};
use super::symbol_key::{declared_key, reference_key};
use super::Context;
use crate::engine::source::{parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn is_checked(context: &Context, kind: &Type) -> bool {
    let Type::Class(name, _) = kind else { return false };
    let index = context.resolver.index;
    index.is_subtype(name, "java.lang.Throwable") && !index.is_subtype(name, "java.lang.RuntimeException") && !index.is_subtype(name, "java.lang.Error")
}

fn simple(kind: &Type) -> String {
    let name = kind.name();
    name.rsplit('.').next().unwrap_or(&name).to_string()
}

pub fn mock_illegal_throws(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || name_text(context, node) != "thenThrow" {
        return;
    }
    if receiver_name(context, node, false).is_none_or(|owner| !is_descendant(context, &owner, &["org.mockito.stubbing.OngoingStubbing"])) {
        return;
    }
    for exception in arguments(node) {
        let Some(thrown) = context.resolver.type_of(exception) else { continue };
        if !is_checked(context, &thrown) {
            continue;
        }
        let generic = matches!(&thrown, Type::Class(name, _) if name == "java.lang.Exception" || name == "java.lang.Throwable");
        if exception.kind() != "object_creation_expression" && generic {
            continue;
        }
        let mut receiver = node.child_by_field_name("object");
        while let Some(when) = receiver.filter(|call| call.kind() == "method_invocation") {
            let mocked = arguments(when).first().copied().filter(|first| first.kind() == "method_invocation");
            if let Some(mocked) = mocked.filter(|_| static_on_class(context, when, "org.mockito.Mockito", &["when"])) {
                let declared = context.resolver.call_throws(mocked).unwrap_or_default();
                let index = context.resolver.index;
                if !declared.iter().any(|allowed| index.is_subtype(&thrown.name(), &allowed.name())) {
                    let thrown_name = simple(&thrown);
                    let message = if declared.is_empty() {
                        format!("{thrown_name} is not throwable by this method; only unchecked exceptions can be thrown.")
                    } else {
                        let names: Vec<String> = declared.iter().map(simple).collect();
                        format!("{thrown_name} is not throwable by this method; possible exception types are {}, or any unchecked exception.", names.join(", "))
                    };
                    context.report_fixed("MockIllegalThrows", node, preferred(mocked), &message, &[]);
                }
                break;
            }
            receiver = when.child_by_field_name("object");
        }
    }
}

const DO_NAMES: [(&str, &str); 3] = [("doAnswer", "thenAnswer"), ("doReturn", "thenReturn"), ("doThrow", "thenThrow")];

/// Variables Mockito knows as spies, or whose mock has a method stubbed to throw: they are left alone.
fn spies<'t>(context: &Context<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    let mut add = |node: Node<'t>| found.push(node);
    walk(context.file.tree.root_node(), |part| match part.kind() {
        "variable_declarator" => {
            if part.child_by_field_name("value").is_some_and(|value| value.kind() == "method_invocation" && static_on_class(context, value, "org.mockito.Mockito", &["spy"])) {
                add(part);
            }
        }
        "method_invocation" => {
            let name = name_text(context, part);
            if name == "doThrow" && static_on_class(context, part, "org.mockito.Mockito", &["doThrow"]) {
                let when = parent(part).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(part));
                if let Some(first) = when.filter(|call| is_instance_when(context, *call)).and_then(|call| arguments(call).first().copied()) {
                    add(first);
                }
            }
            if name == "thenThrow" && receiver_name(context, part, false).is_some_and(|owner| is_descendant(context, &owner, &["org.mockito.stubbing.OngoingStubbing"])) {
                let when = part.child_by_field_name("object").filter(|call| call.kind() == "method_invocation" && static_on_class(context, *call, "org.mockito.Mockito", &["when"]));
                if let Some(mock) = when.and_then(|call| arguments(call).first().copied()).and_then(|first| first.child_by_field_name("object")) {
                    add(mock);
                }
            }
        }
        "assignment_expression" => {
            let spied = part.child_by_field_name("right").is_some_and(|value| value.kind() == "method_invocation" && static_on_class(context, value, "org.mockito.Mockito", &["spy"]));
            if let (true, Some(left)) = (spied, part.child_by_field_name("left")) {
                add(left);
            }
        }
        _ => {}
    });
    found
}

fn is_instance_when(context: &Context, call: Node) -> bool {
    name_text(context, call) == "when" && receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["org.mockito.stubbing.Stubber"]))
}

fn same_spy(context: &Context, spies: &[Node], mock: Node) -> bool {
    let Some(wanted) = reference_key(context, mock) else { return false };
    spies.iter().any(|spy| match spy.kind() {
        "variable_declarator" => declared_key(context, *spy).is_some_and(|declared| declared == wanted),
        _ => reference_key(context, *spy).is_some_and(|other| other == wanted),
    })
}

/// The variable the name stands for is declared with `@Spy`.
fn annotated_spy(context: &Context, mock: Node) -> bool {
    let Some(wanted) = reference_key(context, mock) else { return false };
    let mut found = false;
    walk(context.file.tree.root_node(), |part| {
        let holder = match part.kind() {
            "variable_declarator" => parent(part),
            "formal_parameter" | "spread_parameter" => Some(part),
            _ => None,
        };
        if let Some(holder) = holder.filter(|_| !found) {
            let spy = annotations_of(holder).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|class| class == "org.mockito.Spy"));
            found = spy && declared_key(context, part).is_some_and(|declared| declared == wanted);
        }
    });
    found
}

pub fn mockito_do_setup(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(name) = DO_NAMES.iter().find(|(name, _)| *name == name_text(context, node)).map(|(_, then)| *then) else { return };
    if !static_on_class(context, node, "org.mockito.Mockito", &[name_text(context, node)]) {
        return;
    }
    let Some(when_call) = parent(node).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(node)) else { return };
    if !is_instance_when(context, when_call) {
        return;
    }
    let Some(mock) = arguments(when_call).first().copied() else { return };
    let Some(mocked) = parent(when_call).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(when_call)) else { return };
    if matches!(mock.kind(), "identifier" | "field_access") && (same_spy(context, &spies(context), mock) || annotated_spy(context, mock)) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(mocked) else { return };
    if resolved.method.returns == Type::Primitive("void") {
        return;
    }
    let args = arguments(node);
    let (Some(first), Some(last)) = (args.first(), args.last()) else { return };
    let mut fix = Fix::new();
    let when = qualify_static_import(context, node, "org.mockito.Mockito.when", &mut fix);
    let select_start = node.start_byte();
    let select_end = when_call.child_by_field_name("name").map_or(when_call.start_byte(), |name| name.end_byte());
    let parameters = &context.file.text[first.start_byte()..last.end_byte()];
    let fix = fix
        .and(select_start, select_end, when)
        .and(when_call.end_byte() - 1, when_call.end_byte(), "")
        .insert(mocked.end_byte(), format!(").{name}({parameters})"));
    let message = "Prefer using when/thenReturn over doReturn/when for additional type safety.";
    context.report_fixed("MockitoDoSetup", node, preferred(node), message, &[fix]);
}
