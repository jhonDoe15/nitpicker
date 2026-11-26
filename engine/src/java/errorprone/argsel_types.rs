//! `Types.isAssignable` as javac answers it for Error Prone's `Parameter.isAssignableTo`: a formal's type variables stay
//! variables, so a value of another type does not go into them.
use crate::java::types::index::TypeIndex;
use crate::java::types::model::Type;

fn widens(from: &str, to: &str) -> bool {
    const ORDER: [&str; 6] = ["byte", "short", "int", "long", "float", "double"];
    let place = |name: &str| ORDER.iter().position(|known| *known == name);
    match (if from == "char" { Some(1) } else { place(from) }, place(to)) {
        (Some(a), Some(b)) => a < b && !(from == "char" && to == "short"),
        _ => false,
    }
}

fn box_of(primitive: &str) -> &'static str {
    match primitive {
        "int" => "java.lang.Integer",
        "long" => "java.lang.Long",
        "short" => "java.lang.Short",
        "byte" => "java.lang.Byte",
        "char" => "java.lang.Character",
        "double" => "java.lang.Double",
        "float" => "java.lang.Float",
        _ => "java.lang.Boolean",
    }
}

fn unbox(name: &str) -> Option<&'static str> {
    Some(match name {
        "java.lang.Integer" => "int",
        "java.lang.Long" => "long",
        "java.lang.Short" => "short",
        "java.lang.Byte" => "byte",
        "java.lang.Character" => "char",
        "java.lang.Double" => "double",
        "java.lang.Float" => "float",
        "java.lang.Boolean" => "boolean",
        _ => return None,
    })
}

/// Whether the type arguments of a class type fit the parameterized type it goes into.
fn arguments_fit(index: &TypeIndex, same: &dyn Fn(&str) -> bool, from: &Type, name: &str, wanted: &[Type]) -> bool {
    if wanted.is_empty() {
        return true;
    }
    let Some(given) = index.arguments_as(from, name).filter(|given| given.len() == wanted.len()) else { return true };
    given.iter().zip(wanted).all(|(own, other)| match (own, other) {
        (_, Type::Wildcard) | (Type::Wildcard, _) => true,
        (_, Type::Class(name, _)) | (Type::Class(name, _), _) if name == "?" => true,
        (Type::Variable(left), Type::Variable(right)) => left == right && same(left),
        (Type::Variable(_), _) | (_, Type::Variable(_)) => false,
        (Type::Class(left, _), Type::Class(right, _)) => left == right || index.is_subtype(left, right) || index.is_subtype(right, left),
        (left, right) => left == right,
    })
}

/// `from` goes into `to`. `bound` is what `from` stands for when it is a type variable of the call site; `same` tells
/// whether a type variable of that name in both is one and the same.
pub fn assignable(index: &TypeIndex, same: &dyn Fn(&str) -> bool, from: &Type, bound: &Type, to: &Type) -> bool {
    match (from, to) {
        (Type::Primitive(a), Type::Primitive(b)) => a == b || widens(a, b),
        (Type::Primitive(a), Type::Class(name, _)) => name != "?" && index.is_subtype(box_of(a), name),
        (Type::Primitive(_), _) => false,
        (Type::Null, Type::Primitive(_)) => false,
        (Type::Null, _) => true,
        (Type::Variable(own), Type::Variable(other)) => own == other && same(own),
        (Type::Variable(_), Type::Primitive(_)) => assignable(index, same, bound, bound, to),
        (Type::Variable(_), _) => !matches!(to, Type::Variable(_)) && assignable(index, same, bound, bound, to),
        (Type::Class(name, _), Type::Primitive(target)) => unbox(name).is_some_and(|primitive| primitive == *target || widens(primitive, target)),
        (Type::Class(name, _), Type::Class(target, wanted)) => {
            target != "?" && (index.is_subtype(name, target) || !index.complete(name)) && arguments_fit(index, same, from, target, wanted)
        }
        (Type::Class(..), Type::Array(_) | Type::Variable(_)) => false,
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Object" | "java.lang.Cloneable" | "java.io.Serializable"),
        (Type::Array(a), Type::Array(b)) => match (&**a, &**b) {
            (Type::Primitive(left), Type::Primitive(right)) => left == right,
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
            (left, right) => assignable(index, same, left, left, right),
        },
        _ => false,
    }
}
