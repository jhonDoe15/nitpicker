//! TypeCompatibility: whether two types can be equal, from the types alone, and how Error Prone prints them.
use super::Context;
use crate::java::types::model::{flag, Type, OBJECT};

const WITHOUT_EQUALS: &str = ". Though these types are the same, the type doesn't implement equals.";
const SERIALIZABLE: &str = "java.io.Serializable";
const CLONEABLE: &str = "java.lang.Cloneable";

pub struct Report {
    pub lhs: Type,
    pub rhs: Type,
    pub extra: &'static str,
}

fn incompatible(lhs: &Type, rhs: &Type, extra: &'static str) -> Option<Report> {
    Some(Report { lhs: lhs.clone(), rhs: rhs.clone(), extra })
}

fn class_name(kind: &Type) -> Option<&str> {
    match kind {
        Type::Class(name, _) if !name.contains('&') => Some(name),
        _ => None,
    }
}

fn is_final(context: &Context, name: &str) -> bool {
    context.resolver.index.get(name).is_some_and(|info| info.flags & (flag::FINAL | flag::ENUM | flag::RECORD) != 0)
}

fn is_interface(context: &Context, name: &str) -> bool {
    context.resolver.index.get(name).is_some_and(|info| info.is_interface)
}

fn widens(from: &str, to: &str) -> bool {
    const ORDER: [&str; 6] = ["byte", "short", "int", "long", "float", "double"];
    if from == to {
        return true;
    }
    if from == "char" {
        return ORDER[2..].contains(&to);
    }
    matches!((ORDER.iter().position(|name| *name == from), ORDER.iter().position(|name| *name == to)), (Some(low), Some(high)) if low <= high)
}

fn reference_castable(context: &Context, from: &Type, to: &Type) -> bool {
    let (Some(a), Some(b)) = (class_name(from), class_name(to)) else { return true };
    if a == b || context.resolver.index.is_subtype(a, b) || context.resolver.index.is_subtype(b, a) {
        return true;
    }
    match (is_interface(context, a), is_interface(context, b)) {
        (false, false) => false,
        (true, true) => true,
        (true, false) => !is_final(context, b),
        (false, true) => !is_final(context, a),
    }
}

/// javac's `isCastable(from, to)`.
fn castable(context: &Context, from: &Type, to: &Type) -> bool {
    let index = context.resolver.index;
    match (from, to) {
        (Type::Primitive(a), Type::Primitive(b)) => widens(a, b) || widens(b, a),
        (Type::Primitive(_), Type::Class(name, _)) => index.is_subtype(&from.clone().boxed().name(), name),
        (Type::Class(name, _), Type::Primitive(primitive)) => {
            matches!(from.clone().unboxed_or_same(), Type::Primitive(unboxed) if widens(unboxed, primitive)) || index.is_subtype(&to.clone().boxed().name(), name)
        }
        (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
        (Type::Array(a), Type::Array(b)) => match (&**a, &**b) {
            (Type::Primitive(x), Type::Primitive(y)) => x == y,
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
            (x, y) => castable(context, x, y),
        },
        (Type::Array(_), Type::Class(name, _)) | (Type::Class(name, _), Type::Array(_)) => matches!(name.as_str(), OBJECT | SERIALIZABLE | CLONEABLE),
        (Type::Class(..), Type::Class(..)) => reference_castable(context, from, to),
        _ => true,
    }
}

/// Whether a class the left type inherits from defines `equals(Object)` (other than `Object` and `Enum`) and the right type inherits it too.
fn shares_equals(context: &Context, left: &Type, right: &Type) -> bool {
    let (Some(left_name), Some(right_name)) = (class_name(left), class_name(right)) else { return false };
    let index = context.resolver.index;
    let object = Type::class(OBJECT);
    index.lineage(left_name).iter().chain(std::iter::once(&OBJECT.to_string())).any(|owner| {
        owner != OBJECT
            && owner != "java.lang.Enum"
            && index.get(owner).is_some_and(|info| {
                info.methods.iter().any(|method| method.name == "equals" && !method.is_static && method.parameters == [object.clone()] && method.returns == Type::Primitive("boolean"))
            })
            && index.is_subtype(right_name, owner)
    })
}

/// The nearest common supertype of two classes; `None` where javac would make an intersection.
fn lub(context: &Context, left: &str, right: &str) -> Option<String> {
    let index = context.resolver.index;
    if index.is_subtype(left, right) {
        return Some(right.to_string());
    }
    if index.is_subtype(right, left) {
        return Some(left.to_string());
    }
    let (first, second) = (index.lineage(left), index.lineage(right));
    let common: Vec<&String> = first.iter().filter(|name| *name != OBJECT && second.contains(name)).collect();
    let minimal: Vec<&&String> = common.iter().filter(|name| !common.iter().any(|other| other != *name && index.is_subtype(other, name))).collect();
    match minimal.as_slice() {
        [] => Some(OBJECT.to_string()),
        [only] => Some((**only).clone()),
        _ => None,
    }
}

fn skipped(kind: &Type) -> bool {
    matches!(kind, Type::Variable(_) | Type::Wildcard | Type::Null)
}

fn generics_mismatch(context: &Context, left: &Type, right: &Type, sup: &str, seen_left: &[Type], seen_right: &[Type]) -> Option<Report> {
    let index = context.resolver.index;
    let left_arguments = index.arguments_as(left, sup).unwrap_or_default();
    let right_arguments = index.arguments_as(right, sup).unwrap_or_default();
    for (first, second) in left_arguments.iter().zip(&right_arguments) {
        if skipped(first) || skipped(second) || seen_left.contains(first) || first == left || seen_right.contains(second) || second == right {
            continue;
        }
        let (mut next_left, mut next_right) = (seen_left.to_vec(), seen_right.to_vec());
        next_left.push(left.clone());
        next_right.push(right.clone());
        if let Some(report) = compatibility(context, first, second, &next_left, &next_right) {
            return Some(report);
        }
    }
    None
}

pub fn compatibility(context: &Context, left: &Type, right: &Type, seen_left: &[Type], seen_right: &[Type]) -> Option<Report> {
    if skipped(left) || skipped(right) {
        return None;
    }
    let index = context.resolver.index;
    if left == right {
        let builder = class_name(left).and_then(|name| index.get(name).map(|info| (name, info)));
        return match builder {
            Some((name, info)) if info.enum_constants.is_none() && info.flags & flag::FINAL != 0 && name.rsplit('.').next().is_some_and(|simple| simple.ends_with("Builder")) => incompatible(left, right, WITHOUT_EQUALS),
            _ => None,
        };
    }
    if matches!((left, right), (Type::Primitive(_), Type::Primitive(_))) {
        return incompatible(left, right, "");
    }
    if !castable(context, right, left) && !shares_equals(context, left, right) {
        return incompatible(left, right, "");
    }
    let (Some(left_name), Some(right_name)) = (class_name(left), class_name(right)) else { return None };
    let common = lub(context, left_name, right_name)?;
    if let Some(report) = generics_mismatch(context, left, right, &common, seen_left, seen_right) {
        return Some(report);
    }
    let collection = Type::class("java.util.Collection");
    if common == collection.name() && left.name() != collection.name() && right.name() != collection.name() {
        return incompatible(left, right, "");
    }
    None
}

fn simple(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or(name)
}

/// `Signatures.prettyType`: simple class names, type arguments kept.
pub fn pretty(kind: &Type) -> String {
    match kind {
        Type::Class(name, arguments) if arguments.is_empty() => simple(name).to_string(),
        Type::Class(name, arguments) => format!("{}<{}>", simple(name), arguments.iter().map(pretty).collect::<Vec<_>>().join(", ")),
        Type::Array(element) => format!("{}[]", pretty(element)),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}

/// javac's `Type.toString`: qualified names, type arguments joined by a bare comma.
pub fn qualified(kind: &Type) -> String {
    match kind {
        Type::Class(name, arguments) if arguments.is_empty() => name.clone(),
        Type::Class(name, arguments) => format!("{name}<{}>", arguments.iter().map(qualified).collect::<Vec<_>>().join(",")),
        Type::Array(element) => format!("{}[]", qualified(element)),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}
