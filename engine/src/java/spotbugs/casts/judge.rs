//! Which pattern a cast or `instanceof` makes and at what priority, from the fact of its operand (see `mod`).
use super::facts::{Fact, Origin, interface, subtype};
use super::super::Context;
use crate::java::helpers::has_modifier;
use crate::java::types::model::{OBJECT, Type, flag};

pub const ABSTRACT: &str = "BC_BAD_CAST_TO_ABSTRACT_COLLECTION";
pub const CONCRETE: &str = "BC_BAD_CAST_TO_CONCRETE_COLLECTION";
pub const UNCONFIRMED: &str = "BC_UNCONFIRMED_CAST";
pub const RETURNED: &str = "BC_UNCONFIRMED_CAST_OF_RETURN_VALUE";
pub const IMPOSSIBLE: &str = "BC_IMPOSSIBLE_CAST";
pub const DOWNCAST: &str = "BC_IMPOSSIBLE_DOWNCAST";
pub const TO_ARRAY: &str = "BC_IMPOSSIBLE_DOWNCAST_OF_TOARRAY";
pub const NEVER: &str = "BC_IMPOSSIBLE_INSTANCEOF";
pub const ALWAYS: &str = "BC_VACUOUS_INSTANCEOF";
pub const NULL: &str = "NP_NULL_INSTANCEOF";

const COLLECTION: &str = "java.util.Collection";
const ABSTRACT_TARGETS: &[&str] = &["java.util.List", "java.util.Set", "java.util.SortedSet"];
const COLLECTION_SOURCES: &[&str] =
    &[COLLECTION, "java.util.List", "java.util.Set", "java.util.SortedSet", "java.util.NavigableSet", "java.util.Map", "java.util.SortedMap", "java.util.NavigableMap"];
const CONCRETE_TARGETS: &[&str] = &[
    "java.util.ArrayList", "java.util.LinkedList", "java.util.Vector", "java.util.Stack", "java.util.HashSet", "java.util.LinkedHashSet",
    "java.util.TreeSet", "java.util.HashMap", "java.util.LinkedHashMap", "java.util.TreeMap", "java.util.Hashtable",
];

/// The method a check sits in, as far as priorities go.
pub struct Where {
    /// A public method or constructor, or a static initializer.
    pub public: bool,
}

pub struct Verdict {
    pub pattern: &'static str,
    pub priority: u8,
}

fn class_of(kind: &Type) -> Option<&str> {
    match kind {
        Type::Class(name, _) => Some(name.as_str()),
        _ => None,
    }
}

fn abstract_or_interface(context: &Context, kind: &Type) -> bool {
    class_of(kind).is_some_and(|name| context.resolver.index.get(name).is_some_and(|info| info.is_interface || info.flags & flag::ABSTRACT != 0))
}

fn final_class(context: &Context, kind: &Type) -> bool {
    match kind {
        Type::Array(_) => true,
        Type::Class(name, _) => context.resolver.index.get(name).is_some_and(|info| !info.is_interface && info.flags & flag::FINAL != 0),
        _ => false,
    }
}

/// Whether no value of the fact's type can be of the target type.
pub fn impossible(context: &Context, fact: &Fact, target: &Type) -> bool {
    if subtype(context, &fact.kind, target) {
        return false;
    }
    match (&fact.kind, target) {
        (Type::Array(element), Type::Array(wanted)) => {
            let primitive = matches!(element.as_ref(), Type::Primitive(_)) || matches!(wanted.as_ref(), Type::Primitive(_));
            primitive || fact.exact
        }
        (Type::Array(_), _) => true,
        (_, Type::Array(_)) => fact.exact,
        (Type::Class(source, _), Type::Class(wanted, _)) => {
            if fact.exact || final_class(context, &fact.kind) {
                return true;
            }
            let classes = !interface(context, source) && !interface(context, wanted);
            let unrelated = classes && !subtype(context, target, &fact.kind);
            unrelated || (final_class(context, target) && interface(context, source) && !subtype(context, target, &fact.kind))
        }
        _ => false,
    }
}

/// The classes of the run that are subtypes of a type.
fn known_subtypes<'c>(context: &'c Context, of: &str) -> impl Iterator<Item = &'c String> + 'c {
    let index = &context.resolver.index;
    let of = of.to_string();
    context.project.sources.keys().filter(move |class| **class != of && index.is_subtype(class, &of))
}

pub fn instanceof(context: &Context, fact: &Fact, target: &Type) -> Option<Verdict> {
    if fact.kind == Type::Null {
        return Some(Verdict { pattern: NULL, priority: 2 });
    }
    if matches!(fact.origin, Origin::Element | Origin::Hidden) || class_of(target) == Some(OBJECT) {
        return None;
    }
    if subtype(context, &fact.kind, target) {
        return Some(Verdict { pattern: ALWAYS, priority: 2 });
    }
    impossible(context, fact, target).then(|| Verdict { pattern: NEVER, priority: if matches!(fact.kind, Type::Array(_)) { 1 } else { 2 } })
}

/// What else the method does with the value before a cast.
pub struct Checks {
    /// An earlier `instanceof` tested it against the target.
    pub confirmed: bool,
    /// How many earlier `instanceof` tests tested it against other types.
    pub others: usize,
    /// A `try` around the cast catches `ClassCastException`.
    pub protected: bool,
}

/// The pattern of a cast.
pub fn cast(context: &Context, fact: &Fact, target: &Type, at: &Where, checks: &Checks) -> Option<Verdict> {
    if matches!(fact.origin, Origin::Element | Origin::Hidden) || fact.kind == Type::Null || subtype(context, &fact.kind, target) {
        return None;
    }
    if fact.to_array && matches!(target, Type::Array(_)) {
        return Some(Verdict { pattern: TO_ARRAY, priority: 1 });
    }
    if impossible(context, fact, target) {
        let pattern = if subtype(context, target, &fact.kind) { DOWNCAST } else { IMPOSSIBLE };
        return Some(Verdict { pattern, priority: 1 });
    }
    let (Some(source), Some(wanted)) = (class_of(&fact.kind), class_of(target)) else { return None };
    if source == OBJECT || checks.protected || fact.origin == Origin::Other {
        return None;
    }
    let later = if checks.confirmed { 2 } else { 0 } + u8::from(checks.others >= 2);
    let mut below = known_subtypes(context, source);
    let only = below.next().is_some_and(|first| first == wanted) && below.next().is_none() && abstract_or_interface(context, &fact.kind);
    if fact.origin == Origin::Returned {
        return Some(Verdict { pattern: RETURNED, priority: 3 + later + u8::from(only) });
    }
    let plain = at.public && fact.origin == Origin::Parameter;
    if source == COLLECTION && ABSTRACT_TARGETS.contains(&wanted) {
        return Some(Verdict { pattern: ABSTRACT, priority: if plain { 1 } else { 2 } + later });
    }
    if COLLECTION_SOURCES.contains(&source) && CONCRETE_TARGETS.contains(&wanted) {
        let base = if source == COLLECTION { 1 } else { 2 };
        return Some(Verdict { pattern: CONCRETE, priority: base + u8::from(!plain) + later });
    }
    let mut priority: i32 = 2 + i32::from(!plain) + later as i32;
    if interface(context, wanted) || abstract_or_interface(context, &fact.kind) {
        priority += 1;
    }
    if subtype(context, target, &fact.kind) {
        priority += i32::from(only);
    } else if context.project.sources.contains_key(source) && !known_subtypes(context, source).any(|class| context.resolver.index.is_subtype(class, wanted)) {
        priority -= if !interface(context, source) && !abstract_or_interface(context, &fact.kind) {
            2
        } else if !interface(context, source) || !interface(context, wanted) || known_subtypes(context, source).next().is_some() {
            1
        } else {
            0
        };
    }
    Some(Verdict { pattern: UNCONFIRMED, priority: priority.max(1) as u8 })
}

/// Whether a member is public for SpotBugs' priorities: declared so, an interface member, or an initializer.
pub fn public(class: tree_sitter::Node, member: tree_sitter::Node) -> bool {
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    member.kind() == "static_initializer" || has_modifier(member, "public") || (interface && !has_modifier(member, "private"))
}
