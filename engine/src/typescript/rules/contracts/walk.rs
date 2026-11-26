//! `findInType`: the types a type is built from, breadth first, with what each match is. Also the lookups that
//! start from a symbol or a decorator: which infrastructure a symbol is, and whether a class is a Nest controller.
use super::infrastructure::{Infrastructure, compare_utf16, infrastructure_of, matches_package, package_of};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::{object_flags, type_flags};
use std::collections::HashSet;

const MAX_DEPTH: usize = 8;

fn is_anonymous_object(types: &mut Types, kind: &Type) -> bool {
    kind.flags & type_flags::OBJECT != 0
        && kind.object_flags & object_flags::ANONYMOUS != 0
        && types.symbol(kind).is_none_or(|symbol| symbol.name.starts_with("__"))
}

fn anonymous_parts(types: &mut Types, kind: &Type) -> Vec<Type> {
    let mut parts = Vec::new();
    for signature in types.call_signatures(kind) {
        parts.extend(types.signature_types(&signature));
    }
    for property in types.properties(kind) {
        parts.extend(types.type_of_symbol(&property));
    }
    parts
}

fn parts_of(types: &mut Types, kind: &Type) -> Vec<Type> {
    if kind.flags & type_flags::UNION_OR_INTERSECTION != 0 {
        return types.parts(kind).to_vec();
    }
    let mut parts = types.alias_arguments(kind);
    if kind.flags & type_flags::OBJECT != 0 && Types::is_reference(kind) {
        parts.extend(types.type_arguments(kind));
    }
    if is_anonymous_object(types, kind) {
        parts.extend(anonymous_parts(types, kind));
    }
    parts
}

/// What `matcher` finds in the type and in the types it is built from; a match is not searched further.
pub fn find_in_type<Hit>(types: &mut Types, root: &Type, mut matcher: impl FnMut(&mut Types, &Type) -> Option<Hit>) -> Vec<Hit> {
    let mut seen = HashSet::new();
    let mut found = Vec::new();
    let mut pending = vec![(root.clone(), 0usize)];
    let mut at = 0;
    while at < pending.len() {
        let (kind, depth) = pending[at].clone();
        at += 1;
        if seen.contains(&kind.id) || depth > MAX_DEPTH {
            continue;
        }
        seen.insert(kind.id);
        match matcher(types, &kind) {
            Some(hit) => found.push(hit),
            None => {
                let parts = parts_of(types, &kind);
                pending.extend(parts.into_iter().map(|part| (part, depth + 1)));
            }
        }
        if types.refused.is_some() {
            break;
        }
    }
    found
}

/// `infrastructureOf` of a symbol: its first declaration's file and its name.
pub fn symbol_infrastructure(symbol: &Symbol) -> Option<Infrastructure> {
    let (_, _, file) = parse_handle(symbol.declarations.first()?)?;
    infrastructure_of(file, &symbol.name)
}

/// `typeSymbols`: the alias symbol of a type, then its own symbol.
pub fn type_symbols(types: &mut Types, kind: &Type) -> Vec<Symbol> {
    let alias = types.alias_symbol(kind);
    let own = types.symbol(kind).map(|symbol| (*symbol).clone());
    alias.into_iter().chain(own).collect()
}

/// The infrastructure types a type is built from.
pub fn infrastructure_in(types: &mut Types, kind: &Type) -> Vec<Infrastructure> {
    let mut found = find_in_type(types, kind, |types, candidate| type_symbols(types, candidate).iter().find_map(symbol_infrastructure));
    found.sort_by(|left, right| {
        compare_utf16(&left.package, &right.package).then_with(|| compare_utf16(&left.name, &right.name)).then(left.is_transport().cmp(&right.is_transport()))
    });
    found
}

/// `decoratorNames`: the names of the decorators of a declaration that come from one of the packages.
pub fn decorator_names(types: &mut Types, declaration: &str, packages: &[&str]) -> Vec<String> {
    types
        .decorator_origins(declaration)
        .into_iter()
        .filter(|origin| package_of(&origin.file).is_some_and(|package| packages.iter().any(|name| matches_package(name, &package))))
        .map(|origin| origin.name)
        .collect()
}

pub fn is_nest_controller(types: &mut Types, declaration: &str) -> bool {
    decorator_names(types, declaration, &["@nestjs/common"]).iter().any(|name| name == "Controller")
}
