//! SelfComparison and SelfEquals: an object compared to or tested for equality with itself.
use super::fixes::Fix;
use super::lookup::field_of;
use super::symbol_key::same_symbol;
use super::parts::{arguments, preferred};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::declarators;
use crate::java::types::model::{flag, Type};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const STATIC_EQUALS: [&str; 4] = [
    "android.support.v4.util.ObjectsCompat#equals(java.lang.Object,java.lang.Object)",
    "androidx.v4.util.ObjectsCompat#equals(java.lang.Object,java.lang.Object)",
    "java.util.Objects#equals(java.lang.Object,java.lang.Object)",
    "com.google.common.base.Objects#equal(java.lang.Object,java.lang.Object)",
];

/// `ASTHelpers.sameVariable`: names and field accesses, where `this` is a name too.
fn same_var(context: &Context, first: Node, second: Node) -> bool {
    same_symbol(context, first, second)
}

/// `Matchers.receiverSameAsArgument(0)`.
fn receiver_same_as_argument(context: &Context, call: Node, args: &[Node]) -> bool {
    let Some(first) = args.first() else { return false };
    match call.child_by_field_name("object") {
        Some(object) => same_var(context, object, *first),
        None => first.kind() == "this",
    }
}

pub fn self_comparison(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "compareTo") {
        return;
    }
    let args = arguments(node);
    if !receiver_same_as_argument(context, node, &args) || !context.resolver.matches_sig(node, "java.lang.Comparable#compareTo(_*)") {
        return;
    }
    context.report_fixed("SelfComparison", node, preferred(node), "An object is compared to itself", &[]);
}

fn instance_equals(context: &Context, call: Node) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    let method = &resolved.method;
    !method.is_static && method.name == "equals" && method.parameters.len() == 1 && method.parameters[0].name() == "java.lang.Object" && method.returns == Type::Primitive("boolean")
}

fn static_equals(context: &Context, call: Node) -> bool {
    STATIC_EQUALS.iter().any(|signature| context.resolver.matches_sig(call, signature))
}

/// An assertion's argument: the call sits in the arguments of a static `assertTrue` or `assertThat`.
fn inside_assertion(context: &Context, call: Node) -> bool {
    let Some(list) = parent(call).filter(|list| list.kind() == "argument_list") else { return false };
    let Some(outer) = parent(list).filter(|outer| outer.kind() == "method_invocation") else { return false };
    if outer.child_by_field_name("name").is_none_or(|name| !matches!(context.text(name), "assertTrue" | "assertThat")) {
        return false;
    }
    match context.resolver.resolve_call(outer) {
        Some(resolved) => resolved.method.is_static,
        None => outer.child_by_field_name("object").is_none_or(|object| context.text(object).starts_with(|first: char| first.is_uppercase())),
    }
}

/// What a name or a field access stands for: `this` of a class, or a field.
enum Symbol {
    This(String),
    Field(String, String),
}

fn symbol_of(context: &Context, expression: Node) -> Option<Symbol> {
    match expression.kind() {
        "this" => Some(Symbol::This(enclosing_type(context.file, context.resolver.scope, expression)?)),
        "identifier" | "field_access" => {
            let (declaring, field) = field_of(context, expression)?;
            Some(Symbol::Field(declaring.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

/// A class or an ancestor of it, other than `owner`, declares a field called `name`.
fn hidden_in(context: &Context, class: &str, owner: &str, name: &str) -> bool {
    let index = context.resolver.index;
    let mut seen = Vec::new();
    let mut pending = vec![class.to_string()];
    while let Some(current) = pending.pop() {
        if current == owner || seen.contains(&current) {
            continue;
        }
        let Some(info) = index.get(&current) else { continue };
        if info.fields.iter().any(|field| field.name == name) {
            return true;
        }
        pending.extend(info.superclass.iter().cloned().chain(info.interfaces.iter().cloned()));
        seen.push(current);
    }
    false
}

/// Whether every class from `class` up to `owner` is in the package of `owner`, and `class` is not an interface.
fn package_inherited(context: &Context, class: &str, owner: &str) -> bool {
    let index = context.resolver.index;
    let Some(package) = index.get(owner).map(|info| info.package.as_str()) else { return false };
    let mut current = Some(class.to_string());
    let mut steps = 0;
    while let Some(name) = current.filter(|name| name != owner && steps < 64) {
        let Some(info) = index.get(&name) else { return false };
        if info.package != package {
            return false;
        }
        current = info.superclass.clone();
        steps += 1;
    }
    index.get(class).is_some_and(|info| !info.is_interface)
}

/// `Symbol.isMemberOf`: the class is the owner, or a subclass that inherits the symbol and does not hide it.
fn member_of(context: &Context, class: &str, symbol: &Symbol) -> bool {
    let index = context.resolver.index;
    let owner = match symbol {
        Symbol::This(owner) | Symbol::Field(owner, _) => owner,
    };
    if class == owner {
        return true;
    }
    if !index.is_subtype(class, owner) {
        return false;
    }
    match symbol {
        Symbol::This(_) => package_inherited(context, class, owner),
        Symbol::Field(_, name) => {
            let Some((info, field)) = index.get(owner).and_then(|info| info.fields.iter().find(|field| &field.name == name).map(|field| (info, field))) else { return false };
            let inherited = if info.is_interface || field.flags & flag::PUBLIC != 0 {
                true
            } else if field.is_private {
                false
            } else if field.flags & flag::PROTECTED != 0 {
                index.get(class).is_some_and(|found| !found.is_interface)
            } else {
                package_inherited(context, class, owner)
            };
            inherited && !hidden_in(context, class, owner, name)
        }
    }
}

/// The nearest block, or the body of the nearest class (`Kind.CLASS`), that holds the call.
fn container<'t>(call: Node<'t>) -> Option<Node<'t>> {
    let mut current = parent(call);
    while let Some(node) = current {
        match node.kind() {
            "block" | "constructor_body" => return Some(node),
            "class_body" if parent(node).is_some_and(|owner| matches!(owner.kind(), "class_declaration" | "object_creation_expression" | "enum_constant")) => return Some(node),
            _ => {}
        }
        current = parent(node);
    }
    None
}

/// `SelfEquals.fieldFix`: name the variable of a fitting type that is declared beside the call.
fn field_fix(context: &Context, call: Node, to_replace: Node) -> Option<Fix> {
    let holder = container(call)?;
    let symbol = symbol_of(context, to_replace)?;
    let declarations: Vec<Node> = children(holder).into_iter().flat_map(|member| if member.kind() == "enum_body_declarations" { named_children(member) } else { vec![member] }).collect();
    for declaration in declarations.into_iter().filter(|part| matches!(part.kind(), "field_declaration" | "local_variable_declaration")) {
        for declarator in declarators(declaration) {
            let Some(Type::Class(class, _)) = context.resolver.declared_type(declaration, Some(declarator)) else { continue };
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            if !member_of(context, &class, &symbol) {
                continue;
            }
            if to_replace.kind() == "field_access" {
                let object = to_replace.child_by_field_name("object")?;
                return Some(Fix::replace(object.start_byte(), object.end_byte(), context.text(name)));
            }
            return Some(Fix::new().insert(to_replace.start_byte(), format!("{}.", context.text(name))));
        }
    }
    None
}

pub fn self_equals(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "equals" | "equal") || inside_assertion(context, node) {
        return;
    }
    let args = arguments(node);
    let is_name = |argument: Node| matches!(argument.kind(), "identifier" | "this");
    let to_replace = if name == "equals" && args.len() == 1 && receiver_same_as_argument(context, node, &args) && instance_equals(context, node) {
        args[0]
    } else if args.len() == 2 && same_var(context, args[0], args[1]) && static_equals(context, node) {
        if is_name(args[0]) && !is_name(args[1]) { args[0] } else { args[1] }
    } else {
        return;
    };
    let fixes: Vec<Fix> = field_fix(context, node, to_replace).into_iter().collect();
    context.report_fixed("SelfEquals", node, preferred(node), "Testing an object for equality with itself will always be true.", &fixes);
}
