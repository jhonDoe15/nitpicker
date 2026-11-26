//! RethrowReflectiveOperationExceptionAsLinkageError, SuperCallToObjectMethod and StreamToIterable.
use super::fixes::Fix;
use super::finals::local_of;
use super::locale_fix::qualify_static_import;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, class_of, new_keyword};
use super::positions::preferred;
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn is_reflective_exception_parameter(context: &Context, argument: Node) -> bool {
    if argument.kind() != "identifier" {
        return false;
    }
    let Some(local) = local_of(context, argument, context.text(argument)) else { return false };
    let Some(parameter) = parent(local.name).filter(|holder| holder.kind() == "catch_formal_parameter") else { return false };
    let Some(caught) = children(parameter).into_iter().find(|part| part.kind() == "catch_type") else { return false };
    let types = named_children(caught);
    types.len() == 1 && matches!(context.resolver.type_node(types[0]), Some(Type::Class(name, _)) if name == "java.lang.ReflectiveOperationException")
}

pub fn rethrow_reflective_operation_exception(context: &Context, node: Node) {
    if node.kind() != "throw_statement" {
        return;
    }
    let Some(creation) = node.named_child(0).filter(|part| part.kind() == "object_creation_expression") else { return };
    if class_of(context, creation).as_deref() != Some("java.lang.AssertionError") || children(creation).into_iter().any(|part| part.kind() == "class_body") {
        return;
    }
    let args = arguments(creation);
    if args.is_empty() || args.len() > 2 {
        return;
    }
    let Some(cause) = args.last().filter(|last| is_reflective_exception_parameter(context, **last)) else { return };
    let cause = context.text(*cause);
    let message = if args.len() == 1 { format!("{cause}.getMessage()") } else { context.text(args[0]).to_string() };
    let fix = Fix::replace(creation.start_byte(), creation.end_byte(), format!("new LinkageError({message}, {cause})"));
    context.report_fixed("RethrowReflectiveOperationExceptionAsLinkageError", creation, new_keyword(creation), "Prefer LinkageError for rethrowing ReflectiveOperationException as unchecked", &[fix]);
}

pub fn super_call_to_object_method(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("object").is_none_or(|object| object.kind() != "super") {
        return;
    }
    let equals = match call.child_by_field_name("name").map(|name| context.text(name)) {
        Some("equals") => true,
        Some("hashCode") => false,
        _ => return,
    };
    if !context.resolver.resolve_call(call).is_some_and(|resolved| resolved.declaring == "java.lang.Object") || only_returns_super(call) {
        return;
    }
    let negated = parent(call).is_some_and(|up| up.kind() == "unary_expression" && up.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!"));
    let replacement = if equals {
        let Some(argument) = arguments(call).first().copied().filter(|_| arguments(call).len() == 1) else { return };
        let text = format!("this == {}", context.text(argument));
        if negated { format!("({text})") } else { text }
    } else {
        "System.identityHashCode(this)".to_string()
    };
    let message = if equals { "`super.equals(obj)` is equivalent to `this == obj` here" } else { "`super.hashCode()` is equivalent to `System.identityHashCode(this)` here" };
    let fix = Fix::replace(call.start_byte(), call.end_byte(), replacement);
    context.report_fixed("SuperCallToObjectMethod", call, preferred(context, call), message, &[fix]);
}

/// The call is the only statement of a method: `return super.equals(obj);`.
fn only_returns_super(call: Node) -> bool {
    let Some(statement) = parent(call).filter(|up| up.kind() == "return_statement") else { return false };
    let Some(block) = parent(statement).filter(|up| up.kind() == "block") else { return false };
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).count() <= 1 && parent(block).is_some_and(|up| up.kind() == "method_declaration")
}

fn stream_class(context: &Context, class: &str) -> bool {
    is_descendant(context, class, &["java.util.stream.Stream"])
}

fn is_iterable_target(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.Iterable")
}

fn stream_to_iterable_fix(context: &Context, tree: Node, receiver: Node) -> Fix {
    let mut fix = Fix::new();
    let name = qualify_static_import(context, tree, "com.google.common.collect.ImmutableList.toImmutableList", &mut fix);
    fix.and(tree.start_byte(), tree.end_byte(), format!("{}.collect({name}())", context.text(receiver)))
}

fn report_iterable(context: &Context, tree: Node, receiver: Node, at: usize) {
    let in_loop = parent(tree).is_some_and(|up| up.kind() == "cast_expression") && parent(tree).and_then(parent).is_some_and(|up| up.kind() == "enhanced_for_statement");
    if in_loop {
        return;
    }
    let fix = stream_to_iterable_fix(context, tree, receiver);
    let message = "Using stream::iterator creates a one-shot Iterable, which may cause surprising failures.";
    context.report_fixed("StreamToIterable", tree, at, message, &[fix]);
}

pub fn stream_to_iterable(context: &Context, node: Node) {
    match node.kind() {
        "lambda_expression" => {
            let Some(body) = node.child_by_field_name("body").filter(|body| body.kind() == "method_invocation") else { return };
            if body.child_by_field_name("name").is_none_or(|name| context.text(name) != "iterator") || !is_iterable_target(context, node) {
                return;
            }
            if !receiver_name(context, body, false).is_some_and(|owner| stream_class(context, &owner)) {
                return;
            }
            let Some(receiver) = body.child_by_field_name("object") else { return };
            if !matches!(receiver.kind(), "identifier" | "field_access") || super::lookup::field_of(context, receiver).is_none() && !is_local(context, receiver) {
                return;
            }
            report_iterable(context, node, receiver, node.start_byte());
        }
        "method_reference" => {
            let parts = children(node);
            let (Some(qualifier), Some(name)) = (parts.first().copied(), parts.last().copied()) else { return };
            if context.text(name) != "iterator" || !is_iterable_target(context, node) {
                return;
            }
            let owner = match context.resolver.receiver(qualifier) {
                Some(Receiver::Value(kind)) => kind.erased().name(),
                Some(Receiver::Static(owner)) => owner,
                None => return,
            };
            if stream_class(context, &owner) {
                report_iterable(context, node, qualifier, node.start_byte());
            }
        }
        _ => {}
    }
}

fn is_local(context: &Context, node: Node) -> bool {
    node.kind() == "identifier" && local_of(context, node, context.text(node)).is_some()
}

fn is_this(node: Node) -> bool {
    match node.kind() {
        "this" => true,
        "parenthesized_expression" => node.named_child(0).is_some_and(is_this),
        "cast_expression" => node.child_by_field_name("value").is_some_and(is_this),
        _ => false,
    }
}

struct Returns<'a, 'c, 't> {
    context: &'a Context<'c>,
    thises: Vec<usize>,
    at_least_one: bool,
    all_this: bool,
    marker: std::marker::PhantomData<&'t ()>,
}

impl<'t> Returns<'_, '_, 't> {
    fn returns_this(&self, expression: Node<'t>) -> bool {
        if is_this(expression) {
            return true;
        }
        let context = self.context;
        expression.kind() == "identifier"
            && local_of(context, expression, context.text(expression)).is_some_and(|local| self.thises.contains(&local.name.id()))
    }

    fn scan(&mut self, node: Node<'t>) {
        if !self.all_this {
            return;
        }
        match node.kind() {
            "lambda_expression" | "object_creation_expression" => return,
            "return_statement" => {
                self.at_least_one = true;
                if !named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|expression| self.returns_this(expression)) {
                    self.all_this = false;
                }
                return;
            }
            "variable_declarator" => {
                let declaration = parent(node);
                let settled = declaration.is_some_and(|holder| holder.kind() == "local_variable_declaration" && super::donot::considered_final(self.context, node));
                if let (true, Some(value), Some(name)) = (settled, node.child_by_field_name("value"), node.child_by_field_name("name")) {
                    if is_this(value) {
                        self.thises.push(name.id());
                    }
                }
            }
            "resource" => {
                if let (Some(value), Some(name)) = (node.child_by_field_name("value"), node.child_by_field_name("name")) {
                    if is_this(value) {
                        self.thises.push(name.id());
                    }
                }
            }
            _ => {}
        }
        for part in children(node) {
            self.scan(part);
        }
    }
}

pub fn self_always_returns_this(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let (Some(name), Some(parameters), Some(body), Some(kind)) =
        (method.child_by_field_name("name"), method.child_by_field_name("parameters"), method.child_by_field_name("body"), method.child_by_field_name("type"))
    else {
        return;
    };
    if !matches!(context.text(name), "self" | "getThis") || parameters.named_child_count() != 0 || crate::java::helpers::has_modifier(method, "static") {
        return;
    }
    let returned = context.resolver.type_node(kind);
    let Some(Type::Class(returned, _)) = returned else { return };
    if returned == "java.lang.Void" || crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, method).as_deref() != Some(returned.as_str()) {
        return;
    }
    let mut scan = Returns { context, thises: Vec::new(), at_least_one: false, all_this: true, marker: std::marker::PhantomData };
    scan.scan(body);
    if scan.at_least_one && scan.all_this {
        return;
    }
    let fix = Fix::replace(body.start_byte(), body.end_byte(), "{ return this; }");
    let message = "Non-abstract instance methods named 'self()' or 'getThis()' that return the enclosing class must always 'return this'";
    context.report_fixed("SelfAlwaysReturnsThis", method, name.start_byte(), message, &[fix]);
}
