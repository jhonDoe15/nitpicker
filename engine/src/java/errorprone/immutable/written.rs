//! Types as a field, a clause or a bound wrote them, wildcards kept, with the text javac prints for them.
use super::super::Context;
use super::super::hierarchy::simple_name;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::{OBJECT, Type};
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

/// Where a type variable is declared: the start of its `type_parameter` node, or a class the file does not hold.
#[derive(Clone, PartialEq, Eq, Hash)]
pub enum Decl {
    Source(usize),
    Index(String, String),
}

#[derive(Clone)]
pub enum Written {
    Primitive(String),
    /// The class, its type arguments unless it is raw, and the text javac prints for it.
    Class(String, Option<Vec<Argument>>, String),
    Array(Box<Written>),
    Variable(String, Decl),
}

#[derive(Clone)]
pub enum Argument {
    Is(Written),
    Extends(Written),
    /// `?` or `? super X`, with the text javac prints for it.
    Open(String),
}

pub fn text(written: &Written) -> String {
    match written {
        Written::Primitive(name) | Written::Variable(name, _) => name.clone(),
        Written::Class(_, _, shown) => shown.clone(),
        Written::Array(element) => format!("{}[]", text(element)),
    }
}

pub fn shown(name: &str, arguments: Option<&Vec<Argument>>) -> String {
    let Some(arguments) = arguments else { return name.to_string() };
    let parts: Vec<String> = arguments
        .iter()
        .map(|argument| match argument {
            Argument::Is(kind) => text(kind),
            Argument::Extends(kind) => format!("? extends {}", text(kind)),
            Argument::Open(written) => written.clone(),
        })
        .collect();
    format!("{name}<{}>", parts.join(","))
}

fn arguments(context: &Context, list: Node) -> Option<Vec<Argument>> {
    named_children(list)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .map(|part| {
            if part.kind() != "wildcard" {
                return written(context, part).map(Argument::Is);
            }
            let bound = named_children(part).into_iter().rev().find(|inner| !inner.kind().ends_with("annotation"));
            let lower = children(part).iter().any(|word| word.kind() == "super");
            match bound {
                Some(bound) if lower => Some(Argument::Open(format!("? super {}", text(&written(context, bound)?)))),
                Some(bound) => written(context, bound).map(Argument::Extends),
                None => Some(Argument::Open("?".to_string())),
            }
        })
        .collect()
}

pub fn written(context: &Context, node: Node) -> Option<Written> {
    match node.kind() {
        "integral_type" | "floating_point_type" | "boolean_type" | "void_type" => Some(Written::Primitive(context.text(node).to_string())),
        "array_type" => {
            let mut kind = written(context, node.child_by_field_name("element")?)?;
            let dimensions = node.child_by_field_name("dimensions")?;
            for _ in children(dimensions).iter().filter(|part| part.kind() == "[") {
                kind = Written::Array(Box::new(kind));
            }
            Some(kind)
        }
        "annotated_type" => written(context, named_children(node).into_iter().rev().find(|part| !part.kind().ends_with("annotation"))?),
        "generic_type" => {
            let parts = named_children(node);
            let base = written(context, *parts.first()?)?;
            let given = arguments(context, *parts.iter().find(|part| part.kind() == "type_arguments")?)?;
            let Written::Class(name, _, outer) = base else { return None };
            let print = shown(&outer, Some(&given));
            Some(Written::Class(name, Some(given), print))
        }
        "type_identifier" | "scoped_type_identifier" => match context.resolver.symbolic().type_node(node)? {
            Type::Variable(name) => {
                let at = type_parameter(context.file, node, &name)?.start_byte();
                Some(Written::Variable(name, Decl::Source(at)))
            }
            Type::Class(name, _) => {
                let outer = named_children(node).into_iter().find(|part| part.kind() == "generic_type").and_then(|outer| written(context, outer));
                let print = match outer {
                    Some(outer) => format!("{}.{}", text(&outer), simple_name(&name)),
                    None => implicit_outer(context, node, &name),
                };
                Some(Written::Class(name, None, print))
            }
            _ => None,
        },
        _ => None,
    }
}

/// The text javac prints for a class named without its outer type: an inner class of a generic class shows the
/// outer class with its type variables.
fn implicit_outer(context: &Context, node: Node, name: &str) -> String {
    let index = context.resolver.index;
    let Some((outer, _)) = name.rsplit_once('.') else { return name.to_string() };
    let inner = index.get(name);
    let Some(holder) = index.get(outer) else { return name.to_string() };
    if inner.is_none_or(|info| info.flags & crate::java::types::model::flag::STATIC != 0 || info.is_interface || info.flags & (crate::java::types::model::flag::ENUM | crate::java::types::model::flag::RECORD) != 0) {
        return name.to_string();
    }
    let inside = crate::java::types::scope::enclosing_types(context.resolver.scope, node).iter().any(|class| class == outer);
    if !inside || holder.is_interface || holder.type_parameters.is_empty() || parent(node).is_some_and(|above| above.kind() == "scoped_type_identifier") {
        return name.to_string();
    }
    let variables: Vec<String> = holder.type_parameters.iter().map(|(variable, _)| variable.clone()).collect();
    format!("{outer}<{}>.{}", variables.join(","), simple_name(name))
}

/// The variable `Type::Variable` stands for when read from the class `scope` and the classes around it, or from
/// the declaration around `at`.
fn variable_in(context: &Context, name: &str, scope: &str, at: Option<Node>) -> Written {
    let index = context.resolver.index;
    if let Some(declared) = at.and_then(|at| type_parameter(context.file, at, name)) {
        return Written::Variable(name.to_string(), Decl::Source(declared.start_byte()));
    }
    let mut current = Some(scope.to_string());
    while let Some(class) = current {
        if index.get(&class).is_some_and(|info| info.type_parameters.iter().any(|(own, _)| own == name)) {
            return Written::Variable(name.to_string(), Decl::Index(class, name.to_string()));
        }
        current = class.rsplit_once('.').map(|(up, _)| up.to_string());
    }
    Written::Variable(name.to_string(), Decl::Index(scope.to_string(), name.to_string()))
}

pub fn argument_of(context: &Context, kind: &Type, scope: &str, at: Option<Node>) -> Argument {
    match kind {
        Type::Wildcard => Argument::Open("?".to_string()),
        Type::Bounded(true, bound) => Argument::Open(format!("? super {}", text(&from_type_at(context, bound, scope, at)))),
        Type::Bounded(false, bound) => Argument::Extends(from_type_at(context, bound, scope, at)),
        other => Argument::Is(from_type_at(context, other, scope, at)),
    }
}

/// A type the index holds, read as the class `scope` sees it.
pub fn from_type(context: &Context, kind: &Type, scope: &str) -> Written {
    from_type_at(context, kind, scope, None)
}

/// A type read as the class `scope` sees it, whose variables may also be declared around the node `at`.
pub fn from_type_at(context: &Context, kind: &Type, scope: &str, at: Option<Node>) -> Written {
    match kind {
        Type::Primitive(name) => Written::Primitive((*name).to_string()),
        Type::Array(element) => Written::Array(Box::new(from_type_at(context, element, scope, at))),
        Type::Variable(name) => variable_in(context, name, scope, at),
        Type::Class(name, given) => {
            let given: Option<Vec<Argument>> = (!given.is_empty()).then(|| given.iter().map(|part| argument_of(context, part, scope, at)).collect());
            let print = shown(name, given.as_ref());
            Written::Class(name.clone(), given, print)
        }
        Type::Wildcard | Type::Bounded(..) | Type::Null => Written::Class(OBJECT.to_string(), None, OBJECT.to_string()),
    }
}

/// The bound of a type parameter the index keeps without its type arguments.
pub fn erased_bound(kind: &Type) -> Written {
    match kind {
        Type::Primitive(name) => Written::Primitive((*name).to_string()),
        Type::Array(element) => Written::Array(Box::new(erased_bound(element))),
        other => {
            let name = other.erased().name();
            Written::Class(name.clone(), None, name)
        }
    }
}
