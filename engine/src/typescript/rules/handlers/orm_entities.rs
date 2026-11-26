//! `entitiesIn`: the ORM entities a type is built from: Prisma models and payloads, classes decorated with
//! `@Entity` from TypeORM or MikroORM, and subclasses of the Sequelize model and the Mongoose document.
use crate::typescript::rules::contracts::infrastructure::{compare_utf16, package_of};
use crate::typescript::rules::contracts::walk::{decorator_names, find_in_type};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::{object_flags, type_flags};
use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entity {
    pub name: String,
    pub orm: &'static str,
}

const DECORATOR_ORMS: [(&str, &str); 2] = [("typeorm", "TypeORM"), ("@mikro-orm/*", "MikroORM")];
const BASE_CLASS_ORMS: [(&str, &str, &str); 2] = [("sequelize", "Model", "Sequelize"), ("mongoose", "Document", "Mongoose")];
const PRISMA: &str = "@prisma/client";
const MONGOOSE_DOCUMENT: &str = "Document";
const MONGOOSE_DOC_TYPE: usize = 2;

fn package_of_symbol(symbol: &Symbol) -> Option<String> {
    let (_, _, file) = parse_handle(symbol.declarations.first()?)?;
    package_of(file)
}

fn decorated_orm(types: &mut Types, symbol: &Symbol) -> Option<&'static str> {
    let classes = types.class_declarations(symbol);
    DECORATOR_ORMS.iter().find(|(package, _)| classes.iter().any(|class| decorator_names(types, class, &[package]).iter().any(|name| name == "Entity"))).map(|(_, orm)| *orm)
}

fn base_class_orm(symbol: &Symbol) -> Option<&'static str> {
    let package = package_of_symbol(symbol);
    BASE_CLASS_ORMS.iter().find(|(owner, name, _)| Some(*owner) == package.as_deref() && *name == symbol.name).map(|(_, _, orm)| *orm)
}

fn class_orm(types: &mut Types, kind: &Type) -> Option<&'static str> {
    let mut chain = vec![kind.clone()];
    let mut seen: HashSet<u64> = HashSet::from([kind.id]);
    let mut at = 0;
    while at < chain.len() {
        let current = chain[at].clone();
        at += 1;
        if let Some(symbol) = types.symbol(&current) {
            let orm = decorated_orm(types, &symbol).or_else(|| base_class_orm(&symbol));
            if orm.is_some() {
                return orm;
            }
        }
        if current.object_flags & (object_flags::CLASS | object_flags::INTERFACE) != 0 {
            for base in types.base_types(&current) {
                if seen.insert(base.id) {
                    chain.push(base);
                }
            }
        }
    }
    None
}

fn is_prisma_model(types: &mut Types, symbol: &Symbol) -> bool {
    let Some(facts) = types.alias_facts(symbol) else { return false };
    facts.top_level && package_of_symbol(symbol).as_deref() == Some(PRISMA) && (facts.literal || facts.default_selection)
}

fn payload_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^\$([A-Za-z0-9_]+)Payload$").expect("payload pattern"))
}

fn prisma_payload_model(types: &mut Types, kind: &Type) -> Option<String> {
    let first = if kind.flags & type_flags::OBJECT == 0 { None } else { types.properties(kind).into_iter().next() };
    let declaration = first.as_ref()?.declarations.first()?.clone();
    let (alias, file) = types.enclosing_alias(&declaration)?;
    let model = payload_pattern().captures(&alias)?.get(1)?.as_str().to_string();
    (package_of(&file).as_deref() == Some(PRISMA)).then_some(model)
}

fn entity_name(types: &mut Types, kind: &Type, orm: &str) -> Option<String> {
    let symbol = types.symbol(kind)?;
    if orm != "Mongoose" || symbol.name != MONGOOSE_DOCUMENT || package_of_symbol(&symbol).as_deref() != Some("mongoose") {
        return Some(symbol.name.clone());
    }
    let arguments = if Types::is_reference(kind) && kind.flags & type_flags::OBJECT != 0 { types.type_arguments(kind) } else { Vec::new() };
    let model = arguments.get(MONGOOSE_DOC_TYPE).and_then(|argument| types.symbol(argument));
    Some(model.filter(|model| !model.name.starts_with("__")).map_or(symbol.name.clone(), |model| model.name.clone()))
}

fn entity_of(types: &mut Types, kind: &Type) -> Option<Entity> {
    if let Some(alias) = types.alias_symbol(kind)
        && is_prisma_model(types, &alias)
    {
        return Some(Entity { name: alias.name, orm: "Prisma" });
    }
    if let Some(model) = prisma_payload_model(types, kind) {
        return Some(Entity { name: model, orm: "Prisma" });
    }
    let orm = if kind.flags & type_flags::OBJECT == 0 { None } else { class_orm(types, kind) }?;
    Some(Entity { name: entity_name(types, kind, orm)?, orm })
}

pub fn entities_in(types: &mut Types, kind: &Type) -> Vec<Entity> {
    let mut found = find_in_type(types, kind, entity_of);
    found.sort_by(|left, right| compare_utf16(&left.name, &right.name).then_with(|| compare_utf16(left.orm, right.orm)));
    found
}
