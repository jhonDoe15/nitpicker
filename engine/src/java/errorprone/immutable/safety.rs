//! Error Prone's `ThreadSafety` for `@Immutable`: which types hold only values that cannot change.
use super::super::Context;
use super::super::hierarchy::{closure, simple_name};
use super::super::immutable_known::{IMMUTABLE, MUTABLE};
use super::vars::{accepted, bounds, formal_bound, key};
use super::written::{Argument, Decl, Written, text};
use crate::java::types::model::{ClassInfo, Type, flag};

/// Why a type is not immutable, the latest reason first; `None` when it is.
pub type Violation = Option<Vec<String>>;

/// `AnnotationInfo`: the class that carries `@Immutable` and the type parameters its `containerOf` names.
#[derive(Clone)]
pub struct Marker {
    pub type_name: String,
    pub container_of: Vec<String>,
}

const ANNOTATION: &str = "java.lang.annotation.Annotation";

pub fn plus(mut path: Vec<String>, edge: String) -> Vec<String> {
    path.insert(0, edge);
    path
}

fn known(name: &str) -> Option<Vec<String>> {
    IMMUTABLE.iter().find(|(class, _)| *class == name).map(|(_, held)| held.iter().map(|name| (*name).to_string()).collect())
}

/// The annotation `@Immutable` on a class, or inherited from the nearest annotated supertype.
pub fn inherited(context: &Context, class: &str) -> Option<Marker> {
    let index = context.resolver.index;
    let info = index.get(class)?;
    if info.flags & flag::IMMUTABLE != 0 {
        return Some(Marker { type_name: info.name.clone(), container_of: info.container_of.clone() });
    }
    let own = Type::Class(info.name.clone(), info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect());
    for above in closure(index, &info.name) {
        let Some(parent) = index.get(&above) else { continue };
        let Some(held) = inherited(context, &above) else { continue };
        let given = index.arguments_as(&own, &above).unwrap_or_default();
        let kept = parent.type_parameters.iter().zip(&given).filter(|((formal, _), _)| held.container_of.contains(formal)).filter_map(|(_, argument)| match argument {
            Type::Variable(name) if info.type_parameters.iter().any(|(own, _)| own == name) => Some(name.clone()),
            _ => None,
        });
        return Some(Marker { type_name: held.type_name, container_of: kept.collect() });
    }
    None
}

/// `getMarkerOrAcceptedAnnotation`: a well-known immutable class, or what `inherited` finds.
pub fn marker(context: &Context, class: &str) -> Option<Marker> {
    match known(class) {
        Some(held) => Some(Marker { type_name: class.to_string(), container_of: held }),
        None => inherited(context, class),
    }
}

/// `hasAnnotation` for `@Immutable`, which is `@Inherited`: on the class or on a superclass.
pub fn annotated(context: &Context, class: &str) -> bool {
    let index = context.resolver.index;
    let mut current = index.get(class);
    while let Some(info) = current {
        if info.flags & flag::IMMUTABLE != 0 {
            return true;
        }
        current = info.superclass.as_deref().and_then(|above| index.get(above));
    }
    false
}

fn variable_safe(context: &Context, name: &str, decl: &Decl, containers: &[String], rec: &mut Vec<Decl>) -> bool {
    let id = key(context, decl);
    if rec.contains(&id) {
        return true;
    }
    rec.push(id);
    let mut safe = false;
    for bound in bounds(context, name, decl) {
        if thread_safe(context, true, containers, &bound, rec).is_none() {
            safe = true;
            break;
        }
    }
    let safe = safe || accepted(context, name, decl);
    rec.pop();
    safe
}

/// `isTypeParameterThreadSafe` from outside the walk.
pub fn parameter_safe(context: &Context, name: &str, decl: &Decl, containers: &[String]) -> bool {
    variable_safe(context, name, decl, containers, &mut Vec::new())
}

/// `isThreadSafeType`.
pub fn thread_safe(context: &Context, allow: bool, containers: &[String], kind: &Written, rec: &mut Vec<Decl>) -> Violation {
    let held: &[String] = if allow { containers } else { &[] };
    let (name, given) = match kind {
        Written::Primitive(_) => return None,
        Written::Array(_) => return Some(vec!["arrays are mutable".to_string()]),
        Written::Variable(name, decl) => {
            if held.contains(name) || variable_safe(context, name, decl, held, rec) {
                return None;
            }
            return Some(vec![if !allow {
                format!("'{name}' is not annotated @ImmutableTypeParameter")
            } else if !held.is_empty() {
                format!("'{name}' is a mutable type variable (not in '{}')", held.join(", "))
            } else {
                format!("'{name}' is a mutable type variable")
            }]);
        }
        Written::Class(name, given, _) => (name, given.as_ref()),
    };
    let index = context.resolver.index;
    let info = index.get(name)?;
    if info.flags & (flag::ENUM | flag::ANNOTATION) != 0 || index.is_subtype(name, ANNOTATION) {
        return None;
    }
    if let Some(found) = marker(context, name) {
        return instantiation(context, held, &found, info, given, rec);
    }
    if MUTABLE.contains(&name.as_str()) {
        return Some(vec![format!("'{}' is mutable", simple_name(name))]);
    }
    let under = |above: &str| index.has(above) && index.is_subtype(name, above);
    if under("com.google.protobuf.MessageLite") && !under("com.google.io.protocol.ProtocolMessage") {
        return under("com.google.protobuf.MutableMessageLite").then(|| vec![format!("'{}' is a mutable proto message", simple_name(name))]);
    }
    if under("com.google.protobuf.Internal.EnumLite") {
        return None;
    }
    Some(vec![format!("the declaration of type '{}' is not annotated with @{}", text(kind), flag::IMMUTABLE_NAME)])
}

/// `threadSafeInstantiation`: a class with a marker, given these type arguments.
pub fn instantiation(context: &Context, containers: &[String], found: &Marker, info: &ClassInfo, given: Option<&Vec<Argument>>, rec: &mut Vec<Decl>) -> Violation {
    let simple = simple_name(&info.name);
    for (at, (parameter, _)) in info.type_parameters.iter().enumerate() {
        let strict = info.immutable_parameters.contains(parameter);
        if !strict && !found.container_of.contains(parameter) {
            continue;
        }
        let Some(given) = given else {
            return Some(vec![format!("'{simple}' required instantiation of '{parameter}' with type parameters, but was raw")]);
        };
        let why = match given.get(at)? {
            Argument::Is(kind) => thread_safe(context, !strict, containers, kind, rec),
            _ if strict => None,
            Argument::Extends(kind) => thread_safe(context, true, containers, kind, rec),
            Argument::Open(_) => thread_safe(context, true, containers, &formal_bound(context, &info.name, at), rec),
        };
        if let Some(why) = why {
            return Some(plus(why, format!("'{simple}' was instantiated with mutable type for '{parameter}'")));
        }
    }
    None
}

/// `checkSuperInstantiation`: a supertype with a marker, given these type arguments.
pub fn super_instantiation(context: &Context, containers: &[String], found: &Marker, name: &str, given: Option<&Vec<Argument>>) -> Violation {
    let info = context.resolver.index.get(name)?;
    if let Some(why) = instantiation(context, containers, found, info, given, &mut Vec::new()) {
        return Some(why);
    }
    for ((parameter, _), argument) in info.type_parameters.iter().zip(given.into_iter().flatten()) {
        let Argument::Is(Written::Variable(variable, decl)) = argument else { continue };
        if !containers.contains(variable) || parameter_safe(context, variable, decl, containers) || found.container_of.contains(parameter) {
            continue;
        }
        return Some(vec![format!("'{}' is not a container of '{parameter}'", found.type_name)]);
    }
    None
}
