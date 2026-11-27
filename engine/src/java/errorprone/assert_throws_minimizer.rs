//! AssertThrowsMinimizer: `assertThrows` whose runnable computes its receiver or arguments, which could throw the
//! expected exception before the call under test.
use super::Context;
use super::already_pure::Constants;
use super::assert_throws_fix::{Namer, statements};
use super::assert_throws_types::{add_throws, hoisted_type, written};
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::positions::arguments;
use super::throws::thrown_by;
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const CHECK: &str = "AssertThrowsMinimizer";
const MESSAGE: &str = "Minimize the amount of logic in assertThrows";
const KNOWN_SAFE: [(&str, &str); 5] = [
    ("java.util.Arrays", "asList"),
    ("com.google.common.collect.ImmutableList", "of"),
    ("com.google.common.collect.ImmutableSet", "of"),
    ("java.util.Collections", "emptyList"),
    ("com.google.net.rpc3.client.RpcClientContext", "create"),
];

struct Found<'t> {
    statement: Node<'t>,
    at: usize,
    lambda: Node<'t>,
    runnable: Node<'t>,
    hoist: Vec<(Node<'t>, String)>,
}

struct Scan<'c, 'a, 't> {
    context: &'c Context<'a>,
    constants: Constants<'c, 'a, 't>,
    exception: String,
    unknown: bool,
}

fn sub(context: &Context, name: &str, of: &str) -> bool {
    context.resolver.index.is_subtype(name, of)
}

fn checked(context: &Context, name: &str) -> bool {
    sub(context, name, "java.lang.Throwable") && !sub(context, name, "java.lang.RuntimeException") && !sub(context, name, "java.lang.Error")
}

impl<'t> Scan<'_, '_, 't> {
    fn thrown(&mut self, tree: Node<'t>) -> Vec<String> {
        thrown_by(self.context, &[tree]).unwrap_or_else(|| {
            self.unknown = true;
            Vec::new()
        })
    }

    fn known_safe(&self, tree: Node) -> bool {
        let context = self.context;
        match tree.kind() {
            "method_invocation" => KNOWN_SAFE.iter().any(|(owner, name)| {
                static_on_class(context, tree, owner, &[name]) && (*name != "create" || arguments(tree).is_empty())
            }) || (static_on_class(context, tree, "com.google.net.rpc.RpcAuthority", &["self"]) && arguments(tree).is_empty()),
            "object_creation_expression" => tree.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| {
                sub(context, &kind.name(), "com.google.android.gms.tagmanager.internal.type.AbstractType")
            }),
            _ => false,
        }
    }

    fn field_identifier(&self, tree: Node) -> bool {
        let context = self.context;
        match tree.kind() {
            "this" | "super" => true,
            "identifier" => matches!(context.resolver.binding(tree, context.text(tree)), Some(crate::java::types::expr::Binding::Field(..))),
            "field_access" => {
                tree.child_by_field_name("object").is_some_and(|object| object.kind() == "this")
                    || tree.child(tree.child_count().saturating_sub(1)).is_some_and(|last| last.kind() == "this")
            }
            _ => false,
        }
    }

    fn may_throw(&mut self, tree: Node<'t>) -> bool {
        if sub(self.context, "java.lang.RuntimeException", &self.exception) {
            return true;
        }
        let exception = self.exception.clone();
        self.thrown(tree).iter().any(|thrown| sub(self.context, &exception, thrown))
    }

    fn needs_hoisting(&mut self, tree: Node<'t>) -> bool {
        let context = self.context;
        if self.known_safe(tree) && !arguments(tree).into_iter().any(|argument| self.needs_hoisting(argument)) {
            return false;
        }
        let class = matches!(tree.kind(), "identifier" | "field_access") && matches!(context.resolver.receiver(tree), Some(Receiver::Static(_)));
        if class || self.field_identifier(tree) || super::consts::constant(context, tree).is_some() {
            return false;
        }
        if checked(context, &self.exception.clone()) && !self.may_throw(tree) {
            return false;
        }
        let needs = match tree.kind() {
            "lambda_expression" => false,
            "method_reference" => match tree.named_child(0) {
                Some(qualifier) if matches!(qualifier.kind(), "generic_type" | "array_type") => true,
                Some(qualifier) if !matches!(qualifier.kind(), "type_identifier" | "scoped_type_identifier") => self.needs_hoisting(qualifier),
                _ => false,
            },
            "array_creation_expression" => {
                let mut parts: Vec<Node> = named_children(tree).into_iter().filter(|part| part.kind() == "dimensions_expr").filter_map(|part| part.named_child(0)).collect();
                if let Some(values) = tree.child_by_field_name("value") {
                    parts.extend(named_children(values).into_iter().filter(|part| !part.kind().ends_with("comment")));
                }
                parts.into_iter().any(|part| self.needs_hoisting(part))
            }
            "array_initializer" => named_children(tree).into_iter().filter(|part| !part.kind().ends_with("comment")).any(|part| self.needs_hoisting(part)),
            "object_creation_expression" => self.new_class_needs_hoisting(tree),
            "cast_expression" => {
                let Some(value) = tree.child_by_field_name("value") else { return true };
                self.needs_hoisting(value) || !self.cast_widens(tree, value)
            }
            _ => true,
        };
        needs && self.constants.expression(tree).is_none()
    }

    /// `isSubtype` of the value's type and the cast's; the engine hands back where a type variable or an unknown class
    /// decides it.
    fn cast_widens(&mut self, cast: Node, value: Node) -> bool {
        let resolver = &self.context.resolver;
        let (Some(from), Some(to)) = (resolver.type_of(value), cast.child_by_field_name("type").and_then(|kind| resolver.type_node(kind))) else {
            self.unknown = true;
            return true;
        };
        let open = |kind: &Type| matches!(kind, Type::Variable(_) | Type::Wildcard | Type::Bounded(..)) || matches!(kind, Type::Class(name, _) if !resolver.index.complete(name));
        if open(&from) || open(&to) {
            self.unknown = true;
        }
        resolver.assignable(&from, &to, true)
    }

    fn new_class_needs_hoisting(&self, tree: Node) -> bool {
        let Some(body) = named_children(tree).into_iter().find(|part| part.kind() == "class_body") else { return true };
        let interface = tree.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind)).and_then(|kind| self.context.resolver.index.get(&kind.name()).map(|info| info.is_interface));
        if interface != Some(true) {
            return true;
        }
        !named_children(body).into_iter().filter(|member| !member.kind().ends_with("comment")).all(|member| member.kind() == "method_declaration")
    }
}

/// The statement an `assertThrows` call stands in, and where javac reports it.
fn statement<'t>(call: Node<'t>) -> Option<(Node<'t>, usize)> {
    let up = parent(call)?;
    match up.kind() {
        "expression_statement" | "return_statement" | "throw_statement" | "yield_statement" | "assert_statement" => Some((up, up.start_byte())),
        "variable_declarator" if up.child_by_field_name("value").is_some_and(|value| value.id() == call.id()) => {
            let declaration = parent(up).filter(|declaration| matches!(declaration.kind(), "local_variable_declaration" | "field_declaration"))?;
            Some((declaration, up.child_by_field_name("name")?.start_byte()))
        }
        _ => None,
    }
}

/// The runnable of a lambda: its body call, or the one call statement of its block.
fn runnable(lambda: Node) -> Option<Node> {
    let body = lambda.child_by_field_name("body")?;
    if body.kind() == "method_invocation" {
        return Some(body);
    }
    let [only] = statements(body)[..] else { return None };
    let call = (body.kind() == "block" && only.kind() == "expression_statement").then(|| only.named_child(0)).flatten()?;
    (call.kind() == "method_invocation").then_some(call)
}

/// `receiverVariableName`: the receiver's class name in lower camel case.
fn receiver_name(context: &Context, receiver: Node) -> Option<String> {
    let name = match context.resolver.receiver(receiver)? {
        Receiver::Static(class) => class,
        Receiver::Value(Type::Array(_)) => "Array".to_string(),
        Receiver::Value(Type::Variable(name)) => name,
        Receiver::Value(kind) => kind.erased().name(),
    };
    let simple = name.rsplit(['.', '$']).next()?.to_string();
    let mut chars = simple.chars();
    let first = chars.next()?;
    Some(first.to_lowercase().chain(chars).collect())
}

fn find<'t>(context: &Context, call: Node<'t>, unknown: &mut bool) -> Option<Found<'t>> {
    if !static_on_class(context, call, "org.junit.Assert", &["assertThrows"]) {
        return None;
    }
    let (statement, at) = statement(call)?;
    let list = arguments(call);
    let lambda = *list.last().filter(|last| last.kind() == "lambda_expression")?;
    let exception = match context.resolver.type_of(list[0]) {
        Some(Type::Class(_, arguments)) => match arguments.first() {
            Some(Type::Class(name, _)) => name.clone(),
            Some(_) => {
                *unknown = true;
                return None;
            }
            None => return None,
        },
        _ => {
            *unknown = true;
            return None;
        }
    };
    let runnable = runnable(lambda)?;
    let resolved = context.resolver.resolve_call(runnable);
    let Some(resolved) = resolved else {
        *unknown = true;
        return None;
    };
    let mut sites: Vec<(Node, Option<String>)> = Vec::new();
    if let Some(receiver) = runnable.child_by_field_name("object") {
        sites.push((receiver, None));
    }
    let names = &resolved.method.names;
    if names.len() != resolved.method.parameters.len() {
        *unknown = true;
        return None;
    }
    for (position, argument) in arguments(runnable).into_iter().enumerate() {
        sites.push((argument, Some(names.get(position).or(names.last())?.clone())));
    }
    let mut scan = Scan { context, constants: Constants::new(context), exception, unknown: false };
    let mut hoist = Vec::new();
    for (site, name) in sites {
        if !scan.needs_hoisting(site) {
            continue;
        }
        match name.or_else(|| receiver_name(context, site)) {
            Some(name) => hoist.push((site, name)),
            None => scan.unknown = true,
        }
    }
    *unknown |= scan.unknown;
    (!hoist.is_empty()).then_some(Found { statement, at, lambda, runnable, hoist })
}

pub fn assert_throws_minimizer(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    let mut calls = Vec::new();
    walk(body, |node| {
        if node.kind() == "method_invocation" && !context.suppressed(CHECK, node) {
            calls.push(node);
        }
    });
    let mut unknown = false;
    let found: Vec<Found> = calls.into_iter().filter_map(|call| find(context, call, &mut unknown)).collect();
    if unknown {
        context.hand_back(CHECK, method);
    }
    let Some(first) = found.first() else { return };
    let mut checked_thrown = Vec::new();
    for site in found.iter().flat_map(|each| each.hoist.iter()) {
        let Some(thrown) = thrown_by(context, &[site.0]) else {
            context.hand_back(CHECK, method);
            return;
        };
        checked_thrown.extend(thrown.into_iter().filter(|name| checked(context, name)));
    }
    let mut fix = Fix::new();
    if !checked_thrown.is_empty() {
        let throwable = checked_thrown.iter().any(|name| !sub(context, name, "java.lang.Exception"));
        fix = add_throws(context, method, body, if throwable { "Throwable" } else { "Exception" }, fix);
    }
    let mut namer = Namer::from(super::idents::all_idents(context, body));
    for current in &found {
        let mut hoisted = String::new();
        for (site, name) in &current.hoist {
            let identifier = namer.avoid_shadowing(name);
            let Some(kind) = hoisted_type(context, *site) else {
                context.hand_back(CHECK, method);
                return;
            };
            let shown = written(context, method, &kind, &mut fix);
            let mut value = *site;
            if site.kind() == "cast_expression" {
                let inner = site.child_by_field_name("value").filter(|inner| context.resolver.type_of(*inner).is_some_and(|from| context.resolver.assignable(&from, &kind, true)));
                value = inner.unwrap_or(value);
            }
            hoisted.push_str(&format!("{shown} {identifier} = {};\n", context.text(value)));
            fix = fix.and(site.start_byte(), site.end_byte(), identifier);
        }
        fix = fix.insert(current.statement.start_byte(), hoisted);
        if let Some(block) = current.lambda.child_by_field_name("body").filter(|block| block.kind() == "block") {
            fix = fix.and(block.start_byte(), current.runnable.start_byte(), "").and(current.runnable.end_byte(), block.end_byte(), "");
        }
    }
    context.report_fixed(CHECK, first.statement, first.at, MESSAGE, &[fix]);
}
