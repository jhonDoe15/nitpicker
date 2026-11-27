//! `relation-shapes.mts`: the relations a decorator, an `EntitySchema` or a MikroORM property builder maps, with
//! their `eager` and `cascade` options.
use super::orm_bindings::{Orm, imported_name, imports_orm, merged_properties, object_of, orm_of, properties_of, static_key_name, value_of, Properties};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum RelationKind {
    ManyToOne,
    OneToOne,
    OneToMany,
    ManyToMany,
}

pub struct Cascade<'s> {
    pub node: Node<'s>,
    pub values: Vec<Node<'s>>,
}

pub struct Relation<'s> {
    pub orm: Orm,
    pub kind: RelationKind,
    pub eager: Option<Node<'s>>,
    pub cascade: Option<Cascade<'s>>,
}

const DECORATOR_NAMES: [&str; 4] = ["ManyToOne", "OneToOne", "OneToMany", "ManyToMany"];
const EAGER: &str = "eager";

fn decorator_kind(name: &str) -> Option<RelationKind> {
    match name {
        "ManyToOne" => Some(RelationKind::ManyToOne),
        "OneToOne" => Some(RelationKind::OneToOne),
        "OneToMany" => Some(RelationKind::OneToMany),
        "ManyToMany" => Some(RelationKind::ManyToMany),
        _ => None,
    }
}

fn builder_kind_named(name: &str) -> Option<RelationKind> {
    match name {
        "manyToOne" => Some(RelationKind::ManyToOne),
        "oneToOne" => Some(RelationKind::OneToOne),
        "oneToMany" => Some(RelationKind::OneToMany),
        "manyToMany" => Some(RelationKind::ManyToMany),
        _ => None,
    }
}

fn schema_kind_named(name: &str) -> Option<RelationKind> {
    match name {
        "many-to-one" | "m:1" | "MANY_TO_ONE" => Some(RelationKind::ManyToOne),
        "one-to-one" | "1:1" | "ONE_TO_ONE" => Some(RelationKind::OneToOne),
        "one-to-many" | "1:m" | "ONE_TO_MANY" => Some(RelationKind::OneToMany),
        "many-to-many" | "m:n" | "MANY_TO_MANY" => Some(RelationKind::ManyToMany),
        _ => None,
    }
}

fn cascade_values<'s>(scopes: &Scopes<'_, 's>, expression: Node<'s>) -> Vec<Node<'s>> {
    let value = value_of(scopes, expression);
    if value.is("ArrayExpression") {
        return value.nodes("elements").into_iter().map(|element| value_of(scopes, element)).collect();
    }
    vec![value]
}

fn is_true<'s>(scopes: &Scopes<'_, 's>, expression: Node<'s>) -> bool {
    let value = value_of(scopes, expression);
    value.is("Literal") && value.get("value") == Value::Bool(true)
}

fn from_properties<'s>(scopes: &Scopes<'_, 's>, orm: Orm, kind: RelationKind, properties: &Properties<'s>) -> Relation<'s> {
    let eager = properties.get(EAGER).filter(|eager| eager.node("value").is_some_and(|value| is_true(scopes, value)));
    let cascade = properties.get("cascade").map(|cascade| Cascade {
        node: cascade,
        values: cascade.node("value").map(|value| cascade_values(scopes, value)).unwrap_or_default(),
    });
    Relation { orm, kind, eager, cascade }
}

fn decorator_relation<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Relation<'s>> {
    let (orm, name) = orm_of(scopes, call.node("callee")?, &DECORATOR_NAMES)?;
    let kind = decorator_kind(&name)?;
    Some(from_properties(scopes, orm, kind, &merged_properties(scopes, &call.nodes("arguments"))))
}

fn template_text(value: Node) -> Option<String> {
    let quasi = value.nodes("quasis").into_iter().next()?;
    match quasi.get("value") {
        Value::Node(index) => value.view.at(index).text("cooked").map(|text| text.into_owned()),
        _ => None,
    }
}

fn schema_kind(value: Node) -> Option<RelationKind> {
    let name = if value.is("Literal") {
        value.text("value").map(|text| text.into_owned())
    } else if value.is("TemplateLiteral") && value.nodes("expressions").is_empty() {
        template_text(value)
    } else if value.is("MemberExpression") {
        static_key_name(value)
    } else {
        None
    };
    name.and_then(|name| schema_kind_named(&name))
}

fn schema_entries<'s>(scopes: &Scopes<'_, 's>, orm: Orm, schema: Option<Node<'s>>) -> Vec<Relation<'s>> {
    let (container, kind_keys): (&str, &[&str]) = match orm {
        Orm::TypeOrm => ("relations", &["type"]),
        Orm::MikroOrm => ("properties", &["kind", "reference"]),
        Orm::Sequelize => return Vec::new(),
    };
    let container = properties_of(scopes, object_of(scopes, schema)).get(container);
    let entries = properties_of(scopes, object_of(scopes, container.and_then(|container| container.node("value"))));
    entries
        .values()
        .filter_map(|entry| {
            let properties = properties_of(scopes, object_of(scopes, entry.node("value")));
            let kind_property = kind_keys.iter().find_map(|key| properties.get(key))?;
            let kind = schema_kind(kind_property.node("value")?)?;
            Some(from_properties(scopes, orm, kind, &properties))
        })
        .collect()
}

fn schema_relations<'s>(scopes: &Scopes<'_, 's>, expression: Node<'s>) -> Vec<Relation<'s>> {
    let Some(callee) = expression.node("callee") else { return Vec::new() };
    match orm_of(scopes, callee, &["EntitySchema"]) {
        Some((orm, _)) => schema_entries(scopes, orm, expression.nodes("arguments").first().copied()),
        None => Vec::new(),
    }
}

fn member_call_name(call: Node) -> Option<String> {
    let callee = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression"))?;
    static_key_name(callee)
}

fn builder_kind(member: Node) -> Option<RelationKind> {
    let mut current = member.node("object");
    while let Some(node) = current {
        let name = member_call_name(node)?;
        if let Some(kind) = builder_kind_named(&name) {
            return Some(kind);
        }
        current = node.node("callee").and_then(|callee| callee.node("object"));
    }
    None
}

fn builder_relation<'s>(scopes: &Scopes<'_, 's>, program: Node<'s>, call: Node<'s>) -> Option<Relation<'s>> {
    let option = member_call_name(call).filter(|option| option == EAGER || option == "cascade")?;
    if !imports_orm(program, Orm::MikroOrm) {
        return None;
    }
    let callee = call.node("callee")?;
    let kind = builder_kind(callee)?;
    let arguments = call.nodes("arguments");
    let node = callee.node("property")?;
    if option == EAGER {
        let eager = arguments.first().is_none_or(|first| is_true(scopes, *first));
        return Some(Relation { orm: Orm::MikroOrm, kind, eager: eager.then_some(node), cascade: None });
    }
    let values = arguments.iter().flat_map(|argument| cascade_values(scopes, *argument)).collect();
    Some(Relation { orm: Orm::MikroOrm, kind, eager: None, cascade: Some(Cascade { node, values }) })
}

/// `relationsAt`: the relations a call or `new` expression maps.
pub fn relations_at<'s>(scopes: &Scopes<'_, 's>, program: Node<'s>, node: Node<'s>) -> Vec<Relation<'s>> {
    if node.is("NewExpression") {
        return schema_relations(scopes, node);
    }
    decorator_relation(scopes, node).into_iter().chain(builder_relation(scopes, program, node)).collect()
}

fn literal_string(value: Node) -> String {
    match value.get("value") {
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) if number.fract() == 0.0 && number.abs() < 1e21 => format!("{}", number as i64),
        Value::Number(number) => number.to_string(),
        Value::Text(..) => value.text("value").map(|text| text.into_owned()).unwrap_or_default(),
        _ if value.get("bigint") != Value::Null => value.text("bigint").map(|text| text.into_owned()).unwrap_or_default(),
        _ if value.get("regex") != Value::Null => value.text("raw").map(|text| text.into_owned()).unwrap_or_default(),
        _ => "null".to_string(),
    }
}

/// `cascadeName`: a cascade option as the name it stands for (`true`, `'remove'`, `Cascade.ALL` as `all`).
pub fn cascade_name<'s>(scopes: &Scopes<'_, 's>, value: Node<'s>) -> Option<String> {
    if value.is("Literal") {
        return Some(literal_string(value));
    }
    if !value.is("MemberExpression") {
        return None;
    }
    let object = value.node("object")?;
    if imported_name(scopes, object, Orm::MikroOrm).as_deref() == Some("Cascade") { static_key_name(value).map(|name| name.to_lowercase()) } else { None }
}
