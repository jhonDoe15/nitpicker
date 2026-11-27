//! TruthAssertExpected: `assertThat(expected).isEqualTo(actual)` has the values the wrong way round. Error Prone offers the
//! swap only when the file still compiles with it; the engine resolves the calls of the swapped chain again.
use super::Context;
use super::call_match::static_on_class;
use super::consts::constant;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use super::truth_checks::on_descendant;
use crate::engine::source::SourceFile;
use crate::java::types::expr::Binding;
use crate::java::types::scope::{FileScope, Resolver};
use tree_sitter::Node;

const MESSAGE: &str = "The actual and expected values appear to be swapped, which results in poor assertion failure messages. The actual value should come first.";
const SUBJECT: &str = "com.google.common.truth.Subject";
const SUBJECT_TERMINATORS: [&str; 5] = ["isEqualTo", "isNotEqualTo", "isSameAs", "isNotSameAs", "containsExactlyElementsIn"];

/// What `ASTHelpers.streamReceivers` walks: each receiver of a call chain.
fn receivers<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    let mut current = call;
    while matches!(current.kind(), "method_invocation" | "field_access") {
        let Some(next) = current.child_by_field_name("object") else { break };
        found.push(next);
        current = next;
    }
    found
}

/// `getRootIdentifier`: the identifier a chain of calls and field reads starts from.
fn root_identifier(node: Node) -> Option<Node> {
    match node.kind() {
        "identifier" => Some(node),
        "field_access" | "method_invocation" => root_identifier(node.child_by_field_name("object")?),
        _ => None,
    }
}

fn expected_value(context: &Context, call: Node) -> bool {
    let [argument] = arguments(call)[..] else { return false };
    let Some(identifier) = root_identifier(argument) else { return false };
    let name = context.text(identifier).to_lowercase();
    let throwable = context.resolver.type_of(identifier).is_some_and(|kind| {
        let name = kind.name();
        name == "java.lang.Throwable" || context.resolver.index.is_subtype(&name, "java.lang.Throwable")
    });
    name.contains("expected") && !name.contains("actual") && !throwable
}

fn assertion(context: &Context, node: Node) -> bool {
    let named = static_on_class(context, node, "com.google.common.truth.Truth", &["assertThat"])
        || static_on_class(context, node, "com.google.common.truth.extensions.proto.ProtoTruth", &["assertThat"])
        || on_descendant(context, node, "com.google.common.truth.StandardSubjectBuilder", "that");
    named && expected_value(context, node)
}

fn terminator(context: &Context, call: Node) -> bool {
    SUBJECT_TERMINATORS.iter().any(|name| on_descendant(context, call, SUBJECT, name))
        || on_descendant(context, call, "com.google.common.truth.MapSubject", "containsExactlyEntriesIn")
        || on_descendant(context, call, "com.google.common.truth.FloatSubject.TolerantFloatComparison", "of")
        || on_descendant(context, call, "com.google.common.truth.DoubleSubject.TolerantDoubleComparison", "of")
}

fn static_field(context: &Context, node: Node) -> bool {
    let name = match node.kind() {
        "identifier" => node,
        "field_access" => match node.child_by_field_name("field") {
            Some(field) => field,
            None => return false,
        },
        _ => return false,
    };
    let text = context.text(name);
    if node.kind() == "identifier" {
        return matches!(context.resolver.binding(node, text), Some(Binding::Field(_, _, field)) if field.flags & crate::java::types::model::flag::STATIC != 0);
    }
    let Some(object) = node.child_by_field_name("object") else { return false };
    let class = match context.resolver.receiver(object) {
        Some(crate::java::types::expr::Receiver::Static(class)) => class,
        Some(crate::java::types::expr::Receiver::Value(kind)) => kind.name(),
        None => return false,
    };
    context.resolver.index.field(&class, text).is_some_and(|(_, field)| field.flags & crate::java::types::model::flag::STATIC != 0)
}

/// `isConstantCreator`: a `new` or a static call whose arguments are all constants.
fn constant_creator(context: &Context, node: Node) -> bool {
    let creates = match node.kind() {
        "object_creation_expression" => true,
        "method_invocation" => context.resolver.resolve_call(node).is_some_and(|resolved| resolved.method.is_static),
        _ => false,
    };
    creates && arguments(node).into_iter().all(|argument| constant(context, argument).is_some())
}

/// Whether the swapped chain resolves call by call; `None` when a call does not, which the engine cannot tell from an
/// error.
fn swap_resolves(context: &Context, call: Node, fix: &Fix) -> Option<bool> {
    let text = fix.applied(&context.file.text)?;
    let tree = crate::engine::runner::parse_text(&text, &crate::java::Java)?;
    let file = SourceFile { path: context.file.path.clone(), text, tree };
    let scope = FileScope::of(&file);
    let resolver = Resolver::new(context.resolver.index, &file, &scope);
    let mut swapped = file.tree.root_node().descendant_for_byte_range(call.start_byte(), call.end_byte())?;
    while swapped.kind() != "method_invocation" || swapped.byte_range() != call.byte_range() {
        swapped = swapped.parent()?;
    }
    let chain = std::iter::once(swapped).chain(receivers(swapped)).filter(|node| node.kind() == "method_invocation");
    for node in chain {
        resolver.resolve_call(node)?;
    }
    Some(true)
}

pub fn truth_assert_expected(context: &Context, call: Node) {
    if !terminator(context, call) || !receivers(call).into_iter().any(|receiver| assertion(context, receiver)) || expected_value(context, call) {
        return;
    }
    let Some(asserted) = receivers(call).into_iter().find(|receiver| assertion(context, *receiver)) else { return };
    let ([asserted_argument], [terminating]) = (&arguments(asserted)[..], &arguments(call)[..]) else { return };
    let class_literal = terminating.kind() == "class_literal";
    if class_literal || constant(context, *terminating).is_some() || static_field(context, *terminating) || constant_creator(context, *terminating) {
        return;
    }
    let fix = Fix::replace(asserted_argument.start_byte(), asserted_argument.end_byte(), context.text(*terminating))
        .and(terminating.start_byte(), terminating.end_byte(), context.text(*asserted_argument));
    let compiles = swap_resolves(context, call, &fix);
    let fixes = if compiles == Some(true) { vec![fix] } else { Vec::new() };
    context.report_fixed("TruthAssertExpected", call, preferred(context, call), MESSAGE, &fixes);
    if compiles.is_none() {
        context.hand_back("TruthAssertExpected", call);
    }
}
