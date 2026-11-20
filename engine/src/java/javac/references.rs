//! Method references the compiler cannot hand to the runtime as they are and compiles as a lambda instead, and
//! lambdas that must be serializable. Both change how the lambdas of a class are numbered.
use crate::engine::source::{children, parent};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::{Resolver, enclosing_types};
use tree_sitter::Node;

const SERIALIZABLE: &str = "java.io.Serializable";

fn local_name(class: &str) -> bool {
    class.split('.').any(|part| part.starts_with(|first: char| first.is_ascii_digit()))
}

/// A member class that needs an instance of the class around it.
fn inner_class(resolver: &Resolver, class: &str) -> bool {
    let Some(info) = resolver.index.get(class) else { return false };
    let Some((outer, _)) = class.rsplit_once('.') else { return false };
    let nested = outer.len() > info.package.len();
    let own_static = info.is_interface || info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) != 0;
    nested && !own_static && !resolver.index.get(outer).is_some_and(|around| around.is_interface)
}

/// The parameter types of the function a method reference stands for, when its target type is known.
fn taken(resolver: &Resolver, reference: Node) -> Option<Vec<Type>> {
    let target = resolver.type_of(reference)?;
    let (declaring, method) = resolver.index.functional_method(&target.name())?;
    let map = resolver.index.member_map(&target, &declaring.name);
    Some(method.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect())
}

/// A type that stands for several at once: `A & B`, or a type variable bound by more than one type.
fn several_bounds(resolver: &Resolver, at: Node, kind: &Type) -> bool {
    match kind {
        Type::Class(name, _) => name.contains('&'),
        Type::Variable(name) => crate::java::types::scope::type_parameter(resolver.file, at, name).is_some_and(|declared| resolver.file.text_of(declared).contains('&')),
        _ => false,
    }
}

/// Whether the method reference is compiled as a lambda: a parameter of several types at once, `super::m` and
/// `Outer.super::m`, an array constructor or `clone()` of an array, the constructor of a local or inner class, a method with a variable number of parameters that is not
/// handed one array, or a protected method inherited from another package.
pub fn becomes_lambda(resolver: &Resolver, reference: Node) -> bool {
    let parts = children(reference);
    let (Some(first), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return false };
    let file = resolver.file;
    let receiver_text: String = file.text_of(first).split_whitespace().collect();
    if receiver_text == "super" || receiver_text.ends_with(".super") || first.kind() == "array_type" {
        return true;
    }
    let simple = if first.kind() == "generic_type" { first.named_child(0).unwrap_or(first) } else { first };
    let written: String = file.text_of(simple).split_whitespace().collect();
    let plain = written.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '$' | '.'));
    let qualified_this = first.child_by_field_name("field").filter(|field| field.kind() == "this").and_then(|_| first.child_by_field_name("object"));
    let class = if plain && first.kind() != "this" && qualified_this.is_none() { resolver.class_name(reference, &written) } else { None };
    if last.kind() == "new" {
        return class.is_some_and(|class| local_name(&class) || inner_class(resolver, &class));
    }
    let name = file.text_of(last);
    let variable = first.kind() == "identifier" && resolver.is_variable(first, &written);
    let receiver = match (&class, first.kind()) {
        (Some(class), _) if !variable => Some(Type::class(class)),
        (_, "this") => enclosing_types(resolver.scope, reference).first().map(|own| Type::class(own)),
        _ => match qualified_this {
            Some(outer) => resolver.class_name(reference, file.text_of(outer)).map(|outer| Type::class(&outer)),
            None => resolver.type_of(first),
        },
    };
    if taken(resolver, reference).is_some_and(|taken| taken.iter().any(|kind| several_bounds(resolver, reference, kind))) {
        return true;
    }
    let Some(receiver) = receiver else { return false };
    if matches!(receiver, Type::Array(_)) {
        return name == "clone";
    }
    let candidates = resolver.index.methods(&receiver.name(), name);
    if candidates.is_empty() {
        return false;
    }
    let own_package = &resolver.scope.package;
    if candidates.iter().all(|(declaring, method)| method.flags & flag::PROTECTED != 0 && &declaring.package != own_package) {
        return true;
    }
    if !candidates.iter().any(|(_, method)| method.varargs) {
        return false;
    }
    let Some(taken) = taken(resolver, reference) else { return candidates.iter().all(|(_, method)| method.varargs) };
    let fits = |method: &crate::java::types::model::Method, count: usize| {
        if !method.varargs {
            return method.parameters.len() == count;
        }
        method.parameters.len() == count && matches!(taken.last(), Some(Type::Array(_)))
    };
    let bound = class.is_none() || variable;
    let direct = candidates.iter().any(|(_, method)| {
        fits(method, taken.len()) || (!bound && !method.is_static && !taken.is_empty() && fits(method, taken.len() - 1))
    });
    !direct
}

/// Whether a lambda has to be serializable: its target type, or one of the types of the cast around it, is.
pub fn serializable(resolver: &Resolver, lambda: Node) -> bool {
    let is = |kind: &Type| kind.name().split('&').any(|name| resolver.index.is_subtype(name.trim(), SERIALIZABLE));
    let mut holder = parent(lambda);
    while let Some(around) = holder.filter(|around| around.kind() == "parenthesized_expression") {
        holder = parent(around);
    }
    if let Some(cast) = holder.filter(|around| around.kind() == "cast_expression") {
        let mut cursor = cast.walk();
        let listed: Vec<Node> = cast.children_by_field_name("type", &mut cursor).collect();
        return listed.into_iter().filter_map(|written| resolver.type_node(written)).any(|kind| is(&kind));
    }
    resolver.type_of(lambda).is_some_and(|target| is(&target))
}
