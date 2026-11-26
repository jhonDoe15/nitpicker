//! JUnitMethodInvoked, ThrowIfUncheckedKnownUnchecked, GuiceNestedCombine and TypeEquals: checks on a method call or a comparison.
use super::Context;
use super::array_calls::variable_bound;
use super::call_match::static_on_class;
use super::contextual_misc::generated_by_enclosing;
use super::fixes::Fix;
use super::hierarchy::formals;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::javac::locals::{Found, Scopes, declaration};
use crate::java::types::expr::unwrap;
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

/// `isSubtype(erasure(type), erasure(of))` for the type of an expression written at `usage`.
pub(super) fn erased_subtype(context: &Context, usage: Node, kind: &Type, of: &str, depth: usize) -> bool {
    match kind {
        Type::Class(name, _) => context.resolver.index.is_subtype(name, of),
        Type::Null => true,
        Type::Variable(name) if depth < 4 => match variable_bound(context, usage, name) {
            Some(bound) => erased_subtype(context, usage, &bound, of, depth + 1),
            None => of == OBJECT,
        },
        Type::Array(_) => matches!(of, OBJECT | "java.lang.Cloneable" | "java.io.Serializable"),
        Type::Bounded(_, bound) => erased_subtype(context, usage, bound, of, depth + 1),
        Type::Wildcard => of == OBJECT,
        _ => false,
    }
}

pub(super) fn expression_subtype(context: &Context, expression: Node, of: &str) -> bool {
    context.resolver.type_of(expression).is_some_and(|kind| erased_subtype(context, expression, &kind, of, 0))
}

const JUNIT_ANNOTATIONS: [&str; 4] = ["org.junit.Ignore", "org.junit.Test", "org.junit.jupiter.api.Disabled", "org.junit.jupiter.api.Test"];

pub fn junit_method_invoked(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let method = &resolved.method;
    let public = method.flags & crate::java::types::model::flag::PUBLIC != 0 || method.detail.access & 1 != 0;
    let junit3 = public
        && method.parameters.is_empty()
        && method.returns == Type::Primitive("void")
        && method.name.starts_with("test")
        && context.resolver.index.is_subtype(&resolved.declaring, "junit.framework.TestCase");
    if !junit3 && !method.detail.annotations.iter().any(|name| JUNIT_ANNOTATIONS.contains(&name.as_str())) {
        return;
    }
    let message = "Directly invoking a JUnit test method is discouraged; only the JUnit test runner should call these methods. If you need to share logic between tests, extract a helper method or class.";
    context.report_fixed("JUnitMethodInvoked", call, preferred(context, call), message, &[]);
}

/// The alternatives of the multi-catch parameter that a use of an identifier stands for.
fn catch_alternatives<'t>(context: &Context, usage: Node<'t>) -> Option<Vec<Type>> {
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let Some(Found::Local(declared)) = declaration(context.resolver, &scopes, usage, context.text(usage)) else { return None };
    let parameter = if declared.kind() == "catch_formal_parameter" { declared } else { return None };
    let alternatives = children(parameter).into_iter().find(|part| part.kind() == "catch_type")?;
    let listed = named_children(alternatives);
    if listed.len() < 2 {
        return None;
    }
    listed.into_iter().map(|part| context.resolver.type_node(part)).collect()
}

fn known_unchecked(context: &Context, usage: Node, kind: &Type) -> bool {
    erased_subtype(context, usage, kind, "java.lang.Error", 0) || erased_subtype(context, usage, kind, "java.lang.RuntimeException", 0)
}

fn argument_known_unchecked(context: &Context, argument: Node) -> bool {
    let argument = unwrap(argument);
    if argument.kind() == "identifier" {
        if let Some(alternatives) = catch_alternatives(context, argument) {
            return alternatives.iter().all(|kind| known_unchecked(context, argument, kind));
        }
    }
    context.resolver.type_of(argument).is_some_and(|kind| known_unchecked(context, argument, &kind))
}

pub fn throw_if_unchecked_known_unchecked(context: &Context, call: Node) {
    if !static_on_class(context, call, "com.google.common.base.Throwables", &["throwIfUnchecked", "propagateIfPossible"]) {
        return;
    }
    let list = arguments(call);
    let [argument] = list.as_slice() else { return };
    if !argument_known_unchecked(context, *argument) {
        return;
    }
    let mut fix = Fix::replace(call.start_byte(), call.end_byte(), format!("throw {}", context.text(*argument)));
    if let Some(statement) = parent(call).filter(|up| up.kind() == "expression_statement") {
        if let Some(block) = parent(statement).filter(|up| matches!(up.kind(), "block" | "constructor_body")) {
            let rest = named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).skip_while(|part| *part != statement).skip(1);
            for later in rest {
                fix = fix.delete(later.start_byte(), later.end_byte());
            }
        }
    }
    let message = "`throwIfUnchecked(knownUnchecked)` is equivalent to `throw knownUnchecked`.";
    context.report_fixed("ThrowIfUncheckedKnownUnchecked", call, preferred(context, call), message, &[fix]);
}

pub fn guice_nested_combine(context: &Context, call: Node) {
    if !static_on_class(context, call, "com.google.inject.util.Modules", &["combine"]) {
        return;
    }
    let list = arguments(call);
    if list.is_empty() || !list.iter().all(|argument| expression_subtype(context, *argument, "com.google.inject.Module")) {
        return;
    }
    let Some(outer) = parent(call).and_then(|up| up.kind().eq("argument_list").then(|| parent(up)).flatten()).filter(|up| up.kind() == "method_invocation") else { return };
    let Some(resolved) = context.resolver.resolve_call(outer) else { return };
    if !resolved.method.varargs {
        return;
    }
    let outer_arguments = arguments(outer);
    let count = resolved.method.parameters.len();
    let Some(index) = outer_arguments.iter().position(|argument| *argument == call) else { return };
    if index + 1 < count {
        return;
    }
    let (first, last) = (list[0], list[list.len() - 1]);
    let fix = Fix::replace(call.start_byte(), first.start_byte(), "").and(last.end_byte(), call.end_byte(), "");
    context.report_fixed("GuiceNestedCombine", call, preferred(context, call), "Nesting Modules.combine() here is unnecessary.", &[fix]);
}

fn is_null_expression(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    expression.kind() == "null_literal" || context.resolver.type_of(expression) == Some(Type::Null)
}

/// `ProcessingEnvUtils.findVariableInScope`: the first parameter of the enclosing method, then field of the enclosing class, of that type.
fn variable_in_scope(context: &Context, tree: Node, of: &str) -> Option<String> {
    let method = ancestor(tree, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]);
    let class = ancestor(tree, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "object_creation_expression"]);
    let mut candidates: Vec<Node> = method.map(formals).unwrap_or_default();
    if let Some(body) = class.and_then(|class| class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))) {
        for member in named_children(body) {
            if member.kind() == "field_declaration" {
                candidates.push(member);
            }
        }
    }
    let index = context.resolver.index;
    candidates.into_iter().find_map(|candidate| {
        let kind = context.resolver.declared_type(candidate, None)?;
        let declarator = if candidate.kind() == "field_declaration" { crate::java::helpers::declarators(candidate).into_iter().next()? } else { candidate };
        let matches = match &kind {
            Type::Class(name, _) => index.is_subtype(name, of),
            _ => false,
        };
        matches.then(|| declarator.child_by_field_name("name").map(|name| context.text(name).to_string())).flatten()
    })
}

fn types_expression(context: &Context, tree: Node) -> Option<String> {
    variable_in_scope(context, tree, "javax.lang.model.util.Types").or_else(|| {
        variable_in_scope(context, tree, "javax.annotation.processing.ProcessingEnvironment").map(|environment| format!("{environment}.getTypeUtils()"))
    })
}

fn describe_type_equals(context: &Context, tree: Node, left: Node, right: Node, negate: bool) {
    if is_null_expression(context, left) || is_null_expression(context, right) {
        return;
    }
    if generated_by_enclosing(context, tree).iter().any(|name| name.starts_with("com.google.auto.value.processor.")) {
        return;
    }
    if !expression_subtype(context, left, "javax.lang.model.type.TypeMirror") && !expression_subtype(context, right, "javax.lang.model.type.TypeMirror") {
        return;
    }
    let mut fixes = Vec::new();
    if let Some(types) = types_expression(context, tree) {
        let prefix = if negate { "!" } else { "" };
        let text = format!("{prefix}{types}.isSameType({}, {})", context.text(left), context.text(right));
        fixes.push(Fix::replace(tree.start_byte(), tree.end_byte(), text));
    }
    let message = "TypeMirror should be compared using Types#isSameType, not equality operators or equals().";
    context.report_fixed("TypeEquals", tree, preferred(context, tree), message, &fixes);
}

pub fn type_equals(context: &Context, tree: Node) {
    match tree.kind() {
        "binary_expression" => {
            let operator = tree.child_by_field_name("operator").map(|operator| context.text(operator));
            if !matches!(operator, Some("==" | "!=")) {
                return;
            }
            let (Some(left), Some(right)) = (tree.child_by_field_name("left"), tree.child_by_field_name("right")) else { return };
            describe_type_equals(context, tree, left, right, operator == Some("!="));
        }
        "method_invocation" => {
            let named = tree.child_by_field_name("name").is_some_and(|name| context.text(name) == "equals");
            if !named {
                return;
            }
            let list = arguments(tree);
            if let (Some(receiver), Some(first)) = (tree.child_by_field_name("object"), list.first()) {
                let instance = context.resolver.resolve_call(tree).is_some_and(|resolved| !resolved.method.is_static);
                if instance && receiver_class(context, tree).is_some_and(|class| context.resolver.index.is_subtype(&class, "javax.lang.model.type.TypeMirror")) {
                    return describe_type_equals(context, tree, receiver, *first, false);
                }
            }
            if static_on_class(context, tree, "java.util.Objects", &["equals"]) && list.len() == 2 {
                describe_type_equals(context, tree, list[0], list[1], false);
            }
        }
        _ => {}
    }
}
