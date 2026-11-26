//! DirectInvocationOnMock: methods called on a mock outside of `when` and `verify`.
use super::Context;
use super::call_match::static_on_class;
use super::annotation_args::annotation_value;
use super::lookup::field_of;
use crate::java::javac::locals::{declaration, Found, Scopes};
use std::cell::OnceCell;
use super::fixes::Fix;
use super::locale_fix::qualify_static_import;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use super::symbol_key::{Key, declaration_key, expression_key};
use crate::engine::source::{children, parent};
use crate::java::helpers::declarators;
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "DirectInvocationOnMock";
const MOCKITO: &str = "org.mockito.Mockito";

type Symbol = (String, String, Vec<Type>);

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

fn is_mock_call(context: &Context, node: Node) -> bool {
    if node.kind() != "method_invocation" || !static_on_class(context, node, MOCKITO, &["mock"]) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return false };
    let parameters = resolved.method.parameters;
    parameters == [Type::class("java.lang.Class")] || parameters == [Type::Array(Box::new(Type::class("java.lang.Object")))]
}

fn symbol_of(context: &Context, call: Node) -> Option<Symbol> {
    let resolved = context.resolver.resolve_call(call)?;
    Some((resolved.declaring, resolved.method.name, resolved.method.parameters))
}

fn find_mocks(context: &Context) -> Vec<Key> {
    let mut mocks = Vec::new();
    crate::engine::source::walk(context.file.tree.root_node(), |node| match node.kind() {
        "local_variable_declaration" | "field_declaration" => {
            for declarator in declarators(node) {
                if declarator.child_by_field_name("value").is_some_and(|value| is_mock_call(context, value)) {
                    mocks.extend(declaration_key(context, declarator));
                }
            }
        }
        "assignment_expression" => {
            if node.child_by_field_name("right").is_some_and(|value| is_mock_call(context, value)) {
                mocks.extend(node.child_by_field_name("left").and_then(|target| expression_key(context, target)));
            }
        }
        _ => {}
    });
    mocks
}

fn is_when(context: &Context, node: Node) -> bool {
    node.kind() == "method_invocation" && matches!(name_of(context, node), "when" | "given") && context.resolver.resolve_call(node).is_some()
}

fn on_descendant(context: &Context, call: Node, owner: &str, name: &str) -> bool {
    name_of(context, call) == name
        && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static)
        && receiver_class(context, call).is_some_and(|class| context.resolver.index.is_subtype(&class, owner))
}

fn is_then_call_real_method(context: &Context, call: Node) -> bool {
    on_descendant(context, call, "org.mockito.stubbing.OngoingStubbing", "thenCallRealMethod") || on_descendant(context, call, "org.mockito.BDDMockito.BDDMyOngoingStubbing", "willCallRealMethod")
}

fn is_do_call_real_method(context: &Context, call: Node) -> bool {
    let receiver_is = |owner: &str, name: &str| call.child_by_field_name("object").is_some_and(|object| object.kind() == "method_invocation" && static_on_class(context, object, owner, &[name]));
    (on_descendant(context, call, "org.mockito.stubbing.Stubber", "when") && receiver_is(MOCKITO, "doCallRealMethod"))
        || (on_descendant(context, call, "org.mockito.BDDMockito.BDDStubber", "given") && receiver_is("org.mockito.BDDMockito", "willCallRealMethod"))
}

/// The parent javac sees: casts are skipped, the qualifier of a call has its method select as parent.
fn javac_parent<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let mut current = node;
    loop {
        let up = parent(current)?;
        if up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(current) {
            return None;
        }
        let up = if up.kind() == "argument_list" { parent(up)? } else { up };
        if up.kind() == "cast_expression" {
            current = up;
            continue;
        }
        return Some(up);
    }
}

/// `@Mock` without an explicit `answer` on a local variable, parameter or other declaration of this file.
fn local_has_mock(context: &Context, declared: Node) -> bool {
    let holder = if declared.kind() == "variable_declarator" { parent(declared) } else { Some(declared) };
    let Some(modifiers) = holder.and_then(crate::java::helpers::modifiers) else { return false };
    children(modifiers).into_iter().any(|annotation| {
        matches!(annotation.kind(), "annotation" | "marker_annotation")
            && annotation.child_by_field_name("name").is_some_and(|name| context.resolver.class_name(holder.unwrap_or(declared), context.text(name)).as_deref() == Some("org.mockito.Mock"))
            && annotation_value(&context.file.text, annotation, "answer").is_none()
    })
}

struct Scan<'c, 'a> {
    context: &'c Context<'a>,
    mocks: Vec<Key>,
    real: Vec<Symbol>,
    scopes: OnceCell<Scopes<'a>>,
}

impl<'a> Scan<'_, 'a> {
    fn is_mock(&self, receiver: Node) -> bool {
        let context = self.context;
        let Some(key) = expression_key(context, receiver) else { return false };
        if self.mocks.contains(&key) || field_of(context, receiver).is_some_and(|(_, field)| field.mock) {
            return true;
        }
        if receiver.kind() != "identifier" || !context.file.text.contains("Mock") {
            return false;
        }
        let scopes = self.scopes.get_or_init(|| Scopes::of(context.file, context.file.tree.root_node()));
        matches!(declaration(context.resolver, scopes, receiver, context.text(receiver)), Some(Found::Local(declared)) if local_has_mock(context, declared))
    }

    fn visit(&mut self, node: Node) {
        let context = self.context;
        if node.kind() == "method_invocation" && !self.visit_call(node) {
            return;
        }
        for part in children(node) {
            if super::DECLARATIONS.contains(&part.kind()) && context.suppressed(NAME, part) {
                continue;
            }
            self.visit(part);
        }
    }

    /// Whether the children of the call are scanned too.
    fn visit_call(&mut self, call: Node) -> bool {
        let context = self.context;
        if is_then_call_real_method(context, call) {
            if let Some(receiver) = call.child_by_field_name("object").filter(|receiver| is_when(context, *receiver)) {
                let first = arguments(receiver).first().copied();
                let symbol = first.and_then(|first| match first.kind() {
                    "method_invocation" => symbol_of(context, first),
                    "object_creation_expression" => context.resolver.resolve_constructor(first).map(|made| (made.declaring, made.method.name, made.method.parameters)),
                    _ => None,
                });
                self.real.extend(symbol);
            }
            return true;
        }
        if is_do_call_real_method(context, call) {
            if let Some(outer) = parent(call).filter(|outer| outer.kind() == "method_invocation" && outer.child_by_field_name("object") == Some(call)) {
                self.real.extend(symbol_of(context, outer));
            }
            return true;
        }
        let Some(symbol) = symbol_of(context, call) else { return true };
        if self.real.contains(&symbol) {
            return true;
        }
        let resolved = context.resolver.resolve_call(call);
        if resolved.is_some_and(|resolved| resolved.method.detail.access & 0x0010 != 0) {
            return false;
        }
        let Some(receiver) = call.child_by_field_name("object") else { return true };
        let guarded = javac_parent(call).is_some_and(|up| is_when(context, up));
        if !self.is_mock(receiver) || guarded {
            return true;
        }
        let shown = if receiver.kind() == "field_access" { receiver.child_by_field_name("field").map_or("", |field| context.text(field)) } else { context.text(receiver) };
        let message = format!("Methods should not be directly invoked on the mock `{shown}`. Should this be part of a verify(..) call?");
        let mut fixes = Vec::new();
        if parent(call).is_some_and(|up| up.kind() == "expression_statement") {
            let mut fix = Fix::new();
            let verify = qualify_static_import(context, call, "org.mockito.Mockito.verify", &mut fix);
            fixes.push(fix.and(receiver.start_byte(), receiver.end_byte(), format!("{verify}({})", context.text(receiver))));
            fixes.push(Fix::new().delete(call.start_byte(), call.end_byte()));
        }
        context.report_fixed(NAME, call, preferred(context, call), &message, &fixes);
        true
    }
}

pub fn direct_invocation_on_mock(context: &Context, root: Node) {
    let mut scan = Scan { context, mocks: find_mocks(context), real: Vec::new(), scopes: OnceCell::new() };
    scan.visit(root);
}
