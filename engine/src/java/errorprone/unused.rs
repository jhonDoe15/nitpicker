//! Where a call's value is dropped, and where dropping it is allowed whatever the method says.
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const VOID: Type = Type::Primitive("void");
const THROWING: [&str; 9] = [
    "org.junit.function.ThrowingRunnable",
    "org.junit.jupiter.api.function.Executable",
    "org.assertj.core.api.ThrowableAssert.ThrowingCallable",
    "com.google.common.truth.ExpectFailure.AssertionCallback",
    "com.google.common.truth.ExpectFailure.DelegatedAssertionCallback",
    "com.google.common.truth.ExpectFailure.StandardSubjectBuilderCallback",
    "com.google.common.truth.ExpectFailure.SimpleSubjectBuilderCallback",
    "com.google.devtools.build.lib.testutil.MoreAsserts.ThrowingRunnable",
    "com.google.gerrit.testing.GerritJUnit.ThrowingRunnable",
];

fn is_comment(node: &Node) -> bool {
    node.kind().ends_with("comment")
}

pub fn statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    named_children(block).into_iter().filter(|part| !is_comment(part)).collect()
}

pub(super) fn switch_is_statement(switch: Node) -> bool {
    parent(switch).is_some_and(|holder| {
        matches!(
            holder.kind(),
            "block" | "constructor_body" | "switch_block_statement_group" | "if_statement" | "for_statement" | "enhanced_for_statement"
                | "while_statement" | "do_statement" | "labeled_statement" | "program"
        )
    })
}

fn is_statement(node: Node) -> bool {
    let kind = node.kind();
    kind.ends_with("_statement")
        || matches!(kind, "block" | "constructor_body" | "local_variable_declaration" | "field_declaration" | "constant_declaration" | "explicit_constructor_invocation")
        || kind.ends_with("_declaration") && node.child_by_field_name("body").is_some() && !kind.contains("method") && !kind.contains("constructor")
        || kind == "switch_expression" && switch_is_statement(node)
}

/// The place of a call whose value nobody takes: `Some(lambda)` when it is the body of a lambda, `Some(call)` when
/// it stands as a statement.
pub fn dropped<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let holder = parent(node)?;
    match holder.kind() {
        "expression_statement" => {
            let rule = parent(holder).filter(|rule| rule.kind() == "switch_rule");
            let valued = rule.and_then(|rule| parent(parent(rule)?)).is_some_and(|switch| !switch_is_statement(switch));
            (!valued).then_some(node)
        }
        "for_statement" => {
            let slot = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
            (!slot("condition") && !slot("body")).then_some(node)
        }
        "lambda_expression" => holder.child_by_field_name("body").filter(|body| body.id() == node.id()).map(|_| holder),
        _ => None,
    }
}

pub fn function_returns_void(context: &Context, function: Node) -> Option<bool> {
    let target = context.resolver.type_of(function)?;
    let (_, method) = context.resolver.index.functional_method(&target.name())?;
    Some(method.returns == VOID)
}

pub fn throwing_type(context: &Context, name: &str) -> bool {
    THROWING.iter().any(|throwing| context.resolver.index.is_subtype(name, throwing))
}

fn call_in<'t>(statement: Option<&Node<'t>>) -> Option<Node<'t>> {
    let statement = statement.filter(|statement| statement.kind() == "expression_statement")?;
    named_children(*statement).into_iter().find(|part| part.kind() == "method_invocation")
}

fn fail_call(context: &Context, statement: Option<&Node>) -> bool {
    let Some(call) = call_in(statement).filter(|call| call.child_by_field_name("name").is_some_and(|name| context.text(name) == "fail")) else {
        return false;
    };
    let Some((resolved, _)) = context.resolver.call_formals(call) else { return false };
    let index = context.resolver.index;
    if resolved.method.is_static {
        return matches!(resolved.declaring.as_str(), "org.junit.Assert" | "junit.framework.Assert" | "junit.framework.TestCase");
    }
    ["com.google.common.truth.AbstractVerb", "com.google.common.truth.StandardSubjectBuilder"].iter().any(|owner| index.is_subtype(&resolved.receiver.name(), owner))
}

fn expects_exception(context: &Context, method: Node) -> bool {
    let Some(modifiers) = crate::java::helpers::modifiers(method) else { return false };
    let named = |annotation: Node, wanted: &str| {
        annotation.child_by_field_name("name").and_then(|name| context.resolver.class_name(method, context.text(name))).as_deref() == Some(wanted)
    };
    let annotations: Vec<Node> = children(modifiers).into_iter().filter(|part| part.kind().ends_with("annotation")).collect();
    let expected = annotations.iter().filter(|annotation| named(**annotation, "org.junit.Test")).any(|annotation| {
        let pairs = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        pairs.iter().filter(|pair| pair.kind() == "element_value_pair").any(|pair| {
            let key = pair.child_by_field_name("key").map(|key| context.text(key));
            let value = pair.child_by_field_name("value").map(|value| context.text(value)).unwrap_or_default();
            key == Some("expected") && !value.ends_with("None.class")
        })
    });
    expected && !annotations.iter().any(|annotation| named(*annotation, "org.junit.Ignore"))
}

/// The call sits where a test waits for it to throw, so its result does not matter.
pub fn exception_testing(context: &Context, node: Node) -> bool {
    let ancestors: Vec<Node> = std::iter::successors(parent(node), |at| parent(*at)).collect();
    let direct = ancestors.first().is_some_and(|holder| holder.kind() == "for_statement");
    let Some(statement) = ancestors.iter().find(|at| is_statement(**at)).filter(|_| !direct) else { return false };
    let block: Vec<Node> = ancestors.iter().find(|at| matches!(at.kind(), "block" | "constructor_body")).map(|block| statements(*block)).unwrap_or_default();
    let place = block.iter().position(|each| each.id() == statement.id());
    let last = place.is_some_and(|place| place + 1 == block.len());
    let rule_call = place.and_then(|place| place.checked_sub(1)).and_then(|before| call_in(block.get(before))).and_then(|call| context.resolver.call_formals(call));
    if last && rule_call.is_some_and(|(call, _)| !call.method.is_static && call.receiver.name() == "org.junit.rules.ExpectedException") {
        return true;
    }
    let tried = ancestors.iter().any(|at| matches!(at.kind(), "try_statement" | "try_with_resources_statement"));
    if tried && place.is_some_and(|place| fail_call(context, block.get(place + 1))) {
        return true;
    }
    if last || ancestors.first().is_some_and(|holder| holder.kind() == "lambda_expression") {
        let around = ancestors.iter().find(|at| matches!(at.kind(), "lambda_expression" | "class_body"));
        let name = around.and_then(|around| match around.kind() {
            "lambda_expression" => context.resolver.type_of(*around).map(|kind| kind.name()),
            _ => enclosing_type(context.file, context.resolver.scope, node),
        });
        if name.is_some_and(|name| throwing_type(context, &name)) {
            return true;
        }
    }
    let method = ancestors.iter().find(|at| at.kind() == "method_declaration");
    last && block.len() == 1 && method.is_some_and(|method| expects_exception(context, *method))
}

/// The call is made on what Mockito's `verify` or a stubber's `when` gives: it records, it does not compute.
pub fn mocking(context: &Context, node: Node) -> bool {
    let Some(object) = node.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") else { return false };
    let name = object.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "verify" | "when") {
        return false;
    }
    let Some((resolved, _)) = context.resolver.call_formals(object) else { return false };
    let index = context.resolver.index;
    match (name, resolved.method.is_static) {
        ("verify", true) => resolved.declaring == "org.mockito.Mockito",
        ("verify", false) => index.is_subtype(&resolved.receiver.name(), "org.mockito.InOrder"),
        (_, is_static) => !is_static && index.is_subtype(&resolved.receiver.name(), "org.mockito.stubbing.Stubber"),
    }
}
