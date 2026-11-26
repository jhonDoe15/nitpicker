//! Whether an entity class maps a version column, for the three ORM families the rule knows.
use super::trees::{decorator_name, decorators, has_version_option, options_have_version};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::NodeTable;
use crate::typescript::types::tables::kind;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Form {
    Typeorm,
    Mikro,
    Sequelize,
}

pub struct Entity {
    pub name: String,
    pub form: Form,
}

#[derive(PartialEq)]
enum Mapping {
    Unversioned,
    Versioned,
    Unmapped,
}

const FAMILIES: [(Form, fn(&str) -> bool); 3] = [
    (Form::Typeorm, |source| source == "typeorm"),
    (Form::Mikro, |source| source.starts_with("@mikro-orm/")),
    (Form::Sequelize, |source| source == "sequelize" || source == "sequelize-typescript"),
];

fn form_of(table: &NodeTable) -> Option<Form> {
    let sources: Vec<String> = table
        .listed(crate::typescript::types::nodes::ROOT, "statements")
        .into_iter()
        .filter(|statement| table.kind(*statement) == kind::IMPORT_DECLARATION)
        .filter_map(|statement| table.child(statement, "moduleSpecifier"))
        .filter(|specifier| table.kind(*specifier) == kind::STRING_LITERAL)
        .filter_map(|specifier| table.text(specifier).map(|text| text.into_owned()))
        .collect();
    FAMILIES.iter().find(|(_, matches)| sources.iter().any(|source| matches(source))).map(|(form, _)| *form)
}

fn mapping_of(unversioned: bool) -> Mapping {
    if unversioned { Mapping::Unversioned } else { Mapping::Versioned }
}

fn extends_model(table: &NodeTable, class: u32) -> bool {
    table.listed(class, "heritageClauses").into_iter().any(|clause| {
        table.listed(clause, "types").into_iter().any(|extended| table.child(extended, "expression").is_some_and(|expression| table.node_text(expression) == "Model"))
    })
}

fn is_init_of(table: &NodeTable, call: u32, name: &str) -> bool {
    let callee = table.child(call, "expression").filter(|callee| table.kind(*callee) == kind::PROPERTY_ACCESS_EXPRESSION);
    callee.is_some_and(|callee| {
        table.child(callee, "name").is_some_and(|member| table.text(member).as_deref() == Some("init"))
            && table.child(callee, "expression").is_some_and(|object| table.node_text(object) == name)
    })
}

fn sequelize_init(table: &NodeTable, name: &str) -> Option<u32> {
    let mut found = None;
    let mut pending = vec![crate::typescript::types::nodes::ROOT];
    while let Some(node) = pending.pop() {
        if table.kind(node) == kind::CALL_EXPRESSION && is_init_of(table, node, name) {
            found = Some(node);
        }
        pending.extend(table.children(node).collect::<Vec<_>>().into_iter().rev());
    }
    found
}

fn sequelize_mapping(table: &NodeTable, class: u32, name: &str) -> Mapping {
    if let Some(decorator) = decorators(table, class).into_iter().find(|decorator| decorator_name(table, *decorator).as_deref() == Some("Table")) {
        return mapping_of(!has_version_option(table, table.child(decorator, "expression")));
    }
    let init = if extends_model(table, class) { sequelize_init(table, name) } else { None };
    match init {
        None => Mapping::Unmapped,
        Some(init) => mapping_of(!options_have_version(table, &table.listed(init, "arguments").into_iter().skip(1).collect::<Vec<_>>())),
    }
}

fn members_decorated(table: &NodeTable, class: u32, form: Form) -> bool {
    table.listed(class, "members").into_iter().any(|member| {
        decorators(table, member).into_iter().any(|decorator| match form {
            Form::Typeorm => decorator_name(table, decorator).as_deref() == Some("VersionColumn"),
            _ => decorator_name(table, decorator).as_deref() == Some("Property") && has_version_option(table, table.child(decorator, "expression")),
        })
    })
}

impl Types {
    fn entity_mapping(&mut self, class: &str, form: Form, name: &str) -> Option<Mapping> {
        let (table, index, _) = self.entity_tree(class)?;
        if form == Form::Sequelize {
            return Some(sequelize_mapping(&table, index, name));
        }
        if !decorators(&table, index).into_iter().any(|decorator| decorator_name(&table, decorator).as_deref() == Some("Entity")) {
            return Some(Mapping::Unmapped);
        }
        let mut chain = vec![class.to_string()];
        chain.extend(self.entity_base(class));
        let mut decorated = false;
        for each in &chain {
            let (table, index, _) = self.entity_tree(each)?;
            decorated |= members_decorated(&table, index, form);
        }
        Some(mapping_of(!decorated))
    }

    /// The entity the type at an extent stands for, when it is a class of a known ORM family that maps no
    /// version column.
    pub fn unversioned_entity(&mut self, start: u32, end: u32) -> Option<Entity> {
        let class = self.entity_class_at(start, end)?;
        let (table, index, _) = self.entity_tree(&class)?;
        let form = form_of(&table)?;
        let name = table.child(index, "name").and_then(|name| table.text(name).map(|text| text.into_owned()))?;
        (self.entity_mapping(&class, form, &name)? == Mapping::Unversioned).then_some(Entity { name, form })
    }
}
