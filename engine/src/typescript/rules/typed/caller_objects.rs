//! Whether a value is a plain data object of the project that a caller hands over: not a class instance, a
//! function, an enum or a library type, and declared in the project's own files.
use super::types::Types;
use crate::typescript::rules::support::view::Node;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::{object_flags, symbol_flags, type_flags};
use regex::Regex;
use std::sync::LazyLock;

const ANONYMOUS: [&str; 2] = ["__type", "__object"];
const NOT_DATA: u32 = symbol_flags::CLASS | symbol_flags::ENUM | symbol_flags::FUNCTION;
const OBJECT_FLAGS_TYPE: u32 = type_flags::ANY | type_flags::NULLABLE | type_flags::NEVER | type_flags::OBJECT | type_flags::UNION | type_flags::INTERSECTION;

static LIBRARY_INIT: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[A-Z][A-Za-z0-9_]*Init$").expect("pattern"));

fn object_flags_of(kind: &Type) -> u32 {
    if kind.flags & OBJECT_FLAGS_TYPE != 0 { kind.object_flags } else { 0 }
}

/// A file is a dependency by the `node_modules` in its path: the compilers' own "external library" answer depends on
/// whether some import reached the file through a `node_modules` lookup, and they decide that differently.
fn is_project_file(types: &mut Types, declaration: &str) -> bool {
    let file = types.file_kind(declaration);
    let in_dependencies = parse_handle(declaration).is_some_and(|(_, _, path)| path.contains("/node_modules/"));
    !(file.default_library || in_dependencies)
}

fn declared_in_project(types: &mut Types, symbol: Option<&Symbol>) -> bool {
    symbol.is_none_or(|symbol| symbol.declarations.iter().all(|declaration| is_project_file(types, declaration)))
}

fn target_of(types: &mut Types, kind: &Type) -> Type {
    types.target(kind).unwrap_or_else(|| kind.clone())
}

fn is_instance(types: &mut Types, kind: &Type) -> bool {
    object_flags_of(&target_of(types, kind)) & object_flags::CLASS != 0
}

fn has_only_project_bases(types: &mut Types, kind: &Type) -> bool {
    let mut pending = vec![kind.clone()];
    let mut queued = std::collections::HashSet::from([kind.id]);
    let mut index = 0;
    while index < pending.len() {
        let target = target_of(types, &pending[index]);
        if object_flags_of(&target) & object_flags::CLASS_OR_INTERFACE != 0 {
            let bases = types.base_types(&target);
            pending.extend(bases.into_iter().filter(|base| queued.insert(base.id)));
        }
        index += 1;
    }
    pending[1..].iter().all(|base| {
        if is_instance(types, base) {
            return false;
        }
        let symbol = types.symbol(base);
        declared_in_project(types, symbol.as_deref())
    })
}

fn is_library_init(types: &mut Types, symbol: &Symbol) -> bool {
    LIBRARY_INIT.is_match(&symbol.name)
        && symbol.flags & symbol_flags::INTERFACE != 0
        && !symbol.declarations.is_empty()
        && symbol.declarations.iter().all(|declaration| types.file_kind(declaration).default_library)
}

fn is_named_project_shape(types: &mut Types, kind: &Type, symbol: &Symbol) -> bool {
    is_library_init(types, symbol) || (declared_in_project(types, Some(symbol)) && has_only_project_bases(types, kind))
}

fn is_anonymous_project_shape(types: &mut Types, kind: &Type, symbol: &Symbol, property: Option<&str>) -> bool {
    if declared_in_project(types, Some(symbol)) {
        return true;
    }
    let known: Vec<Symbol> = match property {
        None => types.properties(kind),
        Some(name) => types.property(kind, name).map(|found| (*found).clone()).into_iter().collect(),
    };
    let project_properties = !known.is_empty() && known.iter().all(|member| declared_in_project(types, Some(member)));
    project_properties || types.has_mutable_index(kind)
}

fn is_caller_part(types: &mut Types, kind: Option<Type>, property: Option<&str>) -> bool {
    let Some(kind) = kind else { return false };
    let Some(symbol) = types.symbol(&kind) else { return false };
    if is_instance(types, &kind)
        || kind.flags & type_flags::UNION_OR_INTERSECTION != 0
        || symbol.flags & NOT_DATA != 0
        || types.signature_count(&kind, false) > 0
        || types.signature_count(&kind, true) > 0
    {
        return false;
    }
    if ANONYMOUS.contains(&symbol.name.as_str()) {
        is_anonymous_project_shape(types, &kind, &symbol, property)
    } else {
        is_named_project_shape(types, &kind, &symbol)
    }
}

fn resolved(types: &mut Types, kind: Type) -> Option<Type> {
    if kind.flags & type_flags::TYPE_PARAMETER != 0 { types.base_constraint(&kind) } else { Some(kind) }
}

fn parts_when(types: &mut Types, kind: &Type, flag: u32) -> Vec<Type> {
    if kind.flags & flag != 0 { types.parts(kind).to_vec() } else { vec![kind.clone()] }
}

fn is_caller_type(types: &mut Types, kind: Type, property: Option<&str>) -> bool {
    let Some(kind) = types.non_nullable(&kind).and_then(|kind| resolved(types, kind)) else { return false };
    parts_when(types, &kind, type_flags::UNION).into_iter().all(|alternative| {
        let Some(choice) = resolved(types, alternative) else { return false };
        parts_when(types, &choice, type_flags::INTERSECTION).into_iter().all(|part| {
            let part = resolved(types, part);
            is_caller_part(types, part, property)
        })
    })
}

/// `isCallerObject`: the value of `node`, without null and undefined, is a project data object in every member
/// of its union; `property` narrows the check of an anonymous type to the property written.
pub fn is_caller_object(types: &mut Types, node: Node, property: Option<&str>) -> bool {
    let Some(kind) = types.type_at(node.start(), node.end()) else { return false };
    let key = format!("caller:{}:{}", kind.id, property.unwrap_or("\u{0}"));
    if let Some(known) = types.kept.get(&key) {
        return *known;
    }
    let verdict = is_caller_type(types, kind, property);
    if types.refused.is_none() {
        types.kept.insert(key, verdict);
    }
    verdict
}
