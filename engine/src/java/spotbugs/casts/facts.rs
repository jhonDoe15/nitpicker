//! What SpotBugs knows of a value at a cast or `instanceof`: its type as the compiled code has it, whether that type
//! is exact, and where the value came from, which sets the priority of an unconfirmed cast.
use super::super::{Context, names};
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

pub const RUNTIME: &str = "java.lang.RuntimeException";
const ERROR: &str = "java.lang.Error";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Origin {
    /// A parameter, `this`, a copy of one, or one narrowed by `instanceof`.
    Parameter,
    /// A field, or a local of an enclosing method that the compiled class keeps in a field.
    Field,
    /// The result of a call to an instance method that is not private.
    Returned,
    /// The result of a call to a static or private method: SpotBugs looks into the method and says nothing.
    Hidden,
    Caught,
    /// Values of different sources that meet.
    Merged,
    Created,
    /// An array element: SpotBugs says nothing about it.
    Element,
    Other,
}

#[derive(Clone, PartialEq, Debug)]
pub struct Fact {
    /// The erased class or array type; `Type::Null` for a value known to be null.
    pub kind: Type,
    /// The type arguments SpotBugs prints after the class: those of the declared type the value came from.
    pub arguments: Option<String>,
    pub exact: bool,
    pub origin: Origin,
    /// The local SpotBugs names the value after: a parameter keeps its own name through copies.
    pub holder: Option<String>,
    /// For a value straight from a call: the called method as SpotBugs names it.
    pub callee: Option<String>,
    /// The result of `Collection.toArray()`.
    pub to_array: bool,
}

impl Fact {
    pub fn new(kind: Type, origin: Origin) -> Fact {
        Fact { kind, arguments: None, exact: false, origin, holder: None, callee: None, to_array: false }
    }
    pub fn null() -> Fact {
        Fact::new(Type::Null, Origin::Other)
    }
}

/// A fact for a value of a declared type, with the type arguments the declaration writes. Nothing for a type
/// variable: SpotBugs reads such a value's type from the generic signature and says nothing about it.
pub fn declared(context: &Context, generic: &Type, origin: Origin) -> Option<Fact> {
    if generic.open() || matches!(generic, Type::Primitive(_) | Type::Null) {
        return None;
    }
    let kind = generic.erased();
    if kind.name().contains('?') {
        return None;
    }
    let arguments = match generic {
        Type::Class(_, given) if !given.is_empty() => Some(format!("<{}>", given.iter().map(|one| printed(context, one)).collect::<Vec<_>>().join(","))),
        _ => None,
    };
    Some(Fact { arguments, ..Fact::new(kind, origin) })
}

/// A type the way SpotBugs prints a generic signature: binary names, `?`, `? extends`, no spaces between arguments.
pub fn printed(context: &Context, kind: &Type) -> String {
    match kind {
        Type::Class(name, given) => {
            let base = names::binary(context, name.split('&').next().unwrap_or(name));
            if given.is_empty() {
                return base;
            }
            format!("{base}<{}>", given.iter().map(|one| printed(context, one)).collect::<Vec<_>>().join(","))
        }
        Type::Array(element) => format!("{}[]", printed(context, element)),
        Type::Variable(name) => name.clone(),
        Type::Wildcard => "?".to_string(),
        Type::Bounded(true, bound) => format!("? super {}", printed(context, bound)),
        Type::Bounded(false, bound) => format!("? extends {}", printed(context, bound)),
        Type::Primitive(name) => (*name).to_string(),
        Type::Null => "null".to_string(),
    }
}

pub fn interface(context: &Context, name: &str) -> bool {
    context.resolver.index.get(name).is_some_and(|info| info.is_interface)
}

pub fn subtype(context: &Context, kind: &Type, of: &Type) -> bool {
    match (kind, of) {
        (_, Type::Class(name, _)) if name == OBJECT => true,
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Cloneable" | "java.io.Serializable"),
        (Type::Array(element), Type::Array(target)) => match (element.as_ref(), target.as_ref()) {
            (Type::Primitive(a), Type::Primitive(b)) => a == b,
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
            (element, target) => subtype(context, element, target),
        },
        (Type::Class(name, _), Type::Class(target, _)) => context.resolver.index.is_subtype(name, target),
        _ => false,
    }
}

/// The type two values meet in, as the JVM's verifier merges classes: the nearest common superclass, or what
/// both implement when an interface is involved.
fn lowest(context: &Context, a: &Type, b: &Type) -> Type {
    if subtype(context, a, b) {
        return b.clone();
    }
    if subtype(context, b, a) {
        return a.clone();
    }
    let (Type::Class(left, _), Type::Class(right, _)) = (a, b) else { return Type::class(OBJECT) };
    if interface(context, left) || interface(context, right) {
        let shared = context.resolver.shared(a, b).erased();
        return Type::class(shared.name().split('&').next().unwrap_or(OBJECT));
    }
    let above = context.resolver.index.superclasses(left);
    above.into_iter().find(|class| context.resolver.index.is_subtype(right, class)).map_or_else(|| Type::class(OBJECT), |class| Type::class(&class))
}

/// The fact where two paths meet. A known null takes the other side's type; one class keeps the type and stays
/// exact when either side was.
pub fn merge(context: &Context, a: &Fact, b: &Fact) -> Fact {
    if a == b {
        return a.clone();
    }
    if a.kind == Type::Null || b.kind == Type::Null {
        let known = if a.kind == Type::Null { b } else { a };
        return Fact { origin: Origin::Merged, ..known.clone() };
    }
    let same = a.origin == b.origin && a.holder == b.holder;
    let origin = if same { a.origin } else { Origin::Merged };
    if a.kind == b.kind {
        let arguments = if a.arguments == b.arguments { a.arguments.clone() } else { None };
        let callee = if a.callee == b.callee { a.callee.clone() } else { None };
        let holder = if a.holder == b.holder { a.holder.clone() } else { None };
        return Fact { kind: a.kind.clone(), arguments, exact: a.exact || b.exact, origin, holder, callee, to_array: a.to_array && b.to_array };
    }
    let kept = same && a.holder.is_some();
    let holder = if kept { a.holder.clone() } else { None };
    Fact { holder, ..Fact::new(lowest(context, &a.kind, &b.kind), origin) }
}

/// The value of a catch parameter: SpotBugs types it by what the `try` body can throw that the clause catches,
/// counting unchecked exceptions as `RuntimeException` (and `Error` where the clause catches that too). Of a
/// multi-catch clause only the first type counts.
pub fn caught(context: &Context, parameter: Node) -> Option<Fact> {
    let clause = crate::engine::source::parent(parameter)?;
    let statement = crate::engine::source::parent(clause)?;
    let listed = |clause: Node| -> Vec<Type> {
        let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
        let types = parameter.and_then(|parameter| children(parameter).into_iter().find(|part| part.kind() == "catch_type"));
        types.map(named_children).unwrap_or_default().into_iter().filter_map(|written| context.resolver.type_node(written)).map(|kind| kind.erased()).collect()
    };
    let clauses: Vec<Node> = children(statement).into_iter().filter(|part| part.kind() == "catch_clause").collect();
    let earlier: Vec<Type> = clauses.iter().take_while(|other| other.id() != clause.id()).flat_map(|other| listed(*other)).collect();
    let mut thrown = thrown(context, statement.child_by_field_name("body")?);
    thrown.extend([Type::class(RUNTIME), Type::class(ERROR)]);
    let mut kinds: Vec<Type> = Vec::new();
    for catching in listed(clause).into_iter().take(1) {
        for one in &thrown {
            let implicit = matches!(one.name().as_str(), RUNTIME | ERROR);
            let found = if subtype(context, one, &catching) {
                Some(one.clone())
            } else if subtype(context, &catching, one) {
                Some(if implicit { one.clone() } else { catching.clone() })
            } else {
                None
            };
            let Some(found) = found.filter(|found| !earlier.iter().any(|before| subtype(context, found, before))) else { continue };
            if !kinds.contains(&found) {
                kinds.push(found);
            }
        }
    }
    let mut kinds = kinds.into_iter();
    let first = kinds.next()?;
    let kind = kinds.fold(first, |met, next| lowest(context, &met, &next));
    Some(Fact::new(kind, Origin::Caught))
}

/// The checked exceptions the calls and `throw` statements of a `try` body declare or throw.
fn thrown(context: &Context, body: Node) -> Vec<Type> {
    let mut found = Vec::new();
    walk(body, |node| {
        if ancestor(node, &["lambda_expression", "class_body"]).is_some_and(|nested| nested.start_byte() >= body.start_byte()) {
            return;
        }
        let listed = match node.kind() {
            "method_invocation" => context.resolver.call_throws(node).unwrap_or_default(),
            "object_creation_expression" => context.resolver.resolve_constructor(node).map(|call| call.method.throws.iter().map(Type::erased).collect()).unwrap_or_default(),
            "throw_statement" => node.named_child(0).and_then(|thrown| context.resolver.type_of(thrown)).map(|kind| vec![kind.erased()]).unwrap_or_default(),
            _ => Vec::new(),
        };
        for kind in listed {
            if !found.contains(&kind) {
                found.push(kind);
            }
        }
    });
    found
}
