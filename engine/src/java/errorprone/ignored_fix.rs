//! The fixes for a call whose result is dropped, shared by CheckReturnValue and FutureReturnValueIgnored.
use super::Context;
use super::fixes::Fix;
use super::locale_fix::qualify_static_import;
use super::fix_helpers::qualify_type;
use super::unused::dropped;
use super::vars::{Named, named};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Receiver;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

/// The range of the statement a call is the whole of: an expression statement, or a slot of a `for` header.
fn statement(node: Node) -> Option<(usize, usize)> {
    let holder = parent(node)?;
    if holder.kind() == "expression_statement" {
        return Some((holder.start_byte(), holder.end_byte()));
    }
    (holder.kind() == "for_statement" && dropped(node).is_some_and(|place| place.id() == node.id())).then(|| (node.start_byte(), node.end_byte()))
}

fn declares(context: &Context, holder: Node, name: &str) -> bool {
    let is = |part: Node| part.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
    match holder.kind() {
        "local_variable_declaration" | "field_declaration" => declarators(holder).into_iter().any(is),
        "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" => is(holder),
        _ => false,
    }
}

/// Whether a variable of that name is visible where the call is, the way `findAllIdents` sees it.
fn in_scope(context: &Context, at: Node, name: &str) -> bool {
    let index = context.resolver.index;
    for scope in std::iter::successors(parent(at), |each| parent(*each)) {
        let local = matches!(scope.kind(), "block" | "constructor_body" | "switch_block_statement_group" | "program" | "for_statement");
        let found = match scope.kind() {
            _ if local => children(scope).into_iter().any(|part| part.end_byte() <= at.start_byte() && declares(context, part, name)),
            "catch_clause" => children(scope).into_iter().any(|part| declares(context, part, name)),
            "enhanced_for_statement" => declares(context, scope, name),
            "try_with_resources_statement" => scope.child_by_field_name("resources").is_some_and(|list| named_children(list).into_iter().any(|part| declares(context, part, name))),
            "lambda_expression" | "method_declaration" | "constructor_declaration" => {
                let list = scope.child_by_field_name("parameters");
                list.is_some_and(|list| (list.kind() == "identifier" && context.text(list) == name) || named_children(list).into_iter().any(|part| declares(context, part, name) || (part.kind() == "identifier" && context.text(part) == name)))
            }
            "class_body" | "enum_body" | "interface_body" => children(scope).into_iter().any(|part| declares(context, part, name)),
            _ => false,
        };
        if found {
            return true;
        }
        if matches!(scope.kind(), "class_declaration" | "enum_declaration" | "record_declaration" | "interface_declaration") {
            let class = crate::java::types::scope::declared_name(context.file, context.resolver.scope, scope);
            if class.is_some_and(|class| index.field(&class, name).is_some()) {
                return true;
            }
        }
    }
    false
}

fn unused_name(context: &Context, call: Node) -> Option<String> {
    std::iter::once("unused".to_string()).chain((2..10).map(|number| format!("unused{number}"))).find(|name| !in_scope(context, call, name))
}

/// A call or name that stands for the same value each time: Error Prone's `ConstantExpressions`.
pub fn constant(context: &Context, expression: Node) -> bool {
    super::already_pure::Constants::new(context).expression(expression).is_some()
}

/// The leftmost name of a chain of calls, when it is a variable: `a` for `a.b().c()`.
fn root_assignable<'t>(context: &Context, call: Node<'t>) -> Option<(Node<'t>, Type)> {
    call.child_by_field_name("object")?;
    let mut current = call;
    while current.kind() == "method_invocation" {
        current = current.child_by_field_name("object")?;
    }
    if !matches!(current.kind(), "identifier" | "field_access") || context.text(current) == "this" || context.text(current).ends_with(".this") {
        return None;
    }
    match context.resolver.receiver(current)? {
        Receiver::Value(kind) => Some((current, written_type(context, current).unwrap_or(kind))),
        Receiver::Static(_) => None,
    }
}

/// Assignability that also compares type arguments: `Future<Void>` does not go into a `Future<String>`.
fn assignable(context: &Context, from: &Type, to: &Type) -> bool {
    if matches!(to, Type::Variable(_)) {
        return from == to;
    }
    if !context.resolver.assignable(from, to, false) {
        return false;
    }
    let (Type::Class(_, _), Type::Class(target, wanted)) = (from, to) else { return true };
    if wanted.is_empty() {
        return true;
    }
    let Some(given) = context.resolver.index.arguments_as(from, target).filter(|given| given.len() == wanted.len()) else { return true };
    given.iter().zip(wanted).all(|(own, other)| matches!(other, Type::Wildcard | Type::Variable(_)) || matches!(own, Type::Wildcard | Type::Variable(_)) || own == other)
}

/// The type a variable was declared with, a type variable kept as such.
fn written_type(context: &Context, name: Node) -> Option<Type> {
    if name.kind() == "identifier" {
        let declared = match named(context, name) {
            Some(Named::Variable(declarator)) if parent(declarator).is_some_and(|declaration| declaration.kind() != "field_declaration") => {
                context.resolver.declared_type(parent(declarator)?, Some(declarator))
            }
            Some(Named::Variable(_)) => None,
            Some(Named::Other(parameter)) => context.resolver.declared_type(parameter, None),
            None => None,
        };
        if declared.is_some() {
            return declared;
        }
    }
    let field = if name.kind() == "field_access" { name.child_by_field_name("field")? } else { name };
    let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, name)?;
    context.resolver.index.field(&owner, context.text(field)).map(|(_, field)| field.generic.clone())
}

fn verify_fix(context: &Context, call: Node) -> Option<Fix> {
    let resolved = context.resolver.resolve_call(call)?;
    if !resolved.method.is_static || resolved.declaring != "org.mockito.Mockito" || resolved.method.name != "verify" {
        return None;
    }
    let argument = call.child_by_field_name("arguments")?.named_child(0).filter(|argument| argument.kind() == "method_invocation")?;
    let object = argument.child_by_field_name("object")?;
    Some(Fix::new().insert(object.end_byte(), ")").delete(call.end_byte() - 1, call.end_byte()))
}

fn has_is_true(context: &Context, kind: &Type) -> bool {
    matches!(kind, Type::Class(..)) && context.resolver.index.methods(&kind.erased().name(), "isTrue").iter().any(|(_, method)| method.parameters.is_empty())
}

/// The fixes at the place of the call, in the order Error Prone offers them.
pub fn call_site_fixes(context: &Context, call: Node) -> Vec<Fix> {
    let mut fixes = Vec::new();
    let result = context.resolver.type_of(call);
    let is_call = call.kind() == "method_invocation";
    if is_call {
        fixes.extend(verify_fix(context, call));
    }
    let mut blanket = true;
    if result == Some(Type::Primitive("boolean")) {
        let mut fix = Fix::new();
        let name = qualify_static_import(context, call, "com.google.common.base.Verify.verify", &mut fix);
        fixes.push(fix.insert(call.start_byte(), format!("{name}(")).insert(call.end_byte(), ")"));
    } else if result.as_ref().is_some_and(|kind| has_is_true(context, kind)) {
        fixes.push(Fix::new().insert(call.end_byte(), ".isTrue()"));
        blanket = false;
    }
    if let (true, Some((root, held)), Some(result)) = (is_call, root_assignable(context, call), result.as_ref()) {
        if assignable(context, result, &held) {
            fixes.push(Fix::new().insert(call.start_byte(), format!("{} = ", context.text(root))));
        }
    }
    let place = statement(call);
    if let (Some((start, _)), true) = (place, blanket) {
        if !constant(context, call) {
            if let Some(name) = unused_name(context, call) {
                fixes.push(Fix::new().insert(start, format!("var {name} = ")));
            }
        }
    }
    if let (Some((start, end)), true) = (place, blanket) {
        fixes.push(Fix::new().delete(start, end));
    }
    fixes
}

/// `@CanIgnoreReturnValue` on the method that is called, when it is declared in this file.
pub fn declaration_fix(context: &Context, class: &str, method: &crate::java::types::model::Method) -> Fix {
    let mut found = None;
    walk(context.file.tree.root_node(), |part| {
        if found.is_some() || !matches!(part.kind(), "method_declaration" | "constructor_declaration") {
            return;
        }
        let named = part.kind() == "constructor_declaration" || part.child_by_field_name("name").is_some_and(|name| context.text(name) == method.name);
        if !named {
            return;
        }
        let same = super::hierarchy::declared_method(context, part).is_some_and(|(origin, own)| origin.name == class && own.name == method.name && own.parameters == method.parameters);
        if same {
            found = Some(part);
        }
    });
    let Some(declaration) = found else { return Fix::new() };
    let mut fix = Fix::new();
    let name = qualify_type(context, declaration, "com.google.errorprone.annotations.CanIgnoreReturnValue", &mut fix);
    fix = fix.insert(declaration.start_byte(), format!("@{name} "));
    let annotations = crate::java::helpers::modifiers(declaration).map(children).unwrap_or_default();
    for annotation in annotations.into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")) {
        if annotation.child_by_field_name("name").is_some_and(|written| context.text(written).rsplit('.').next() == Some("CheckReturnValue")) {
            fix = fix.delete(annotation.start_byte(), annotation.end_byte());
        }
    }
    fix
}
