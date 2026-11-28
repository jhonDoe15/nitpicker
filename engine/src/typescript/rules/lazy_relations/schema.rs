//! `typeorm-schema`: whether a property is a lazy TypeORM relation, from the decorator on its declaration
//! (`@ManyToOne(..., { lazy: true })` or a `Promise` type) or from an `EntitySchema` of the program that marks
//! the relation `lazy`.
use crate::typescript::rules::effects::callees::declarations::nodes;
use crate::typescript::rules::effects::packages::package_from_path;
use crate::typescript::rules::effects::views::At;
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::tables::kind as k;
use std::collections::VecDeque;

const RELATIONS: [&str; 4] = ["ManyToOne", "OneToMany", "OneToOne", "ManyToMany"];
const TYPEORM: &str = "typeorm";
const ENTITY_SCHEMA: &str = "EntitySchema";
const OPEN_TYPES: [&str; 2] = ["ObjectLiteral", "__type"];
const CODE: [&str; 8] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

#[derive(Clone)]
pub struct Relation {
    pub entity: String,
    pub relation: String,
}

#[derive(Clone)]
struct SchemaRelation {
    entity: Option<String>,
    type_name: Option<String>,
    relation: String,
}

/// The lazy relations of the program's entity schemas, kept for the run once they are known.
#[derive(Default)]
pub struct Schemas(Option<Vec<SchemaRelation>>);

/// What a property access reads: the expression it reads from, the property name, the property's declarations.
pub struct Access<'a> {
    pub expression: &'a At,
    pub name: &'a str,
    pub declarations: Vec<At>,
}

/// `getText()`: the node's source from its first token.
pub fn source_of(node: &At) -> String {
    node.table.node_text(node.index).to_string()
}

/// `typeormDeclaration`: the first declaration of what the name resolves to, when TypeORM declares it.
pub fn typeorm_declaration(types: &mut Types, node: &At) -> Option<At> {
    let symbol = types.symbol_at_handle(&node.handle());
    let symbol = types.unaliased(symbol)?;
    let declaration = At::of(types, symbol.declarations.first()?)?;
    (package_from_path(&declaration.path).as_deref() == Some(TYPEORM)).then_some(declaration)
}

fn is_true_option(argument: &At, option: &str) -> bool {
    argument.is(k::OBJECT_LITERAL_EXPRESSION)
        && argument.listed("properties").iter().any(|property| {
            property.is(k::PROPERTY_ASSIGNMENT)
                && property.child("name").is_some_and(|name| source_of(&name) == option)
                && property.child("initializer").is_some_and(|value| value.is(k::TRUE_KEYWORD))
        })
}

fn relation_decorator(types: &mut Types, declaration: &At) -> Option<At> {
    for modifier in declaration.listed("modifiers").into_iter().filter(|modifier| modifier.is(k::DECORATOR)) {
        let Some(expression) = modifier.child("expression").filter(|expression| expression.is(k::CALL_EXPRESSION)) else { continue };
        let Some(callee) = expression.child("expression") else { continue };
        let named = callee.identifier().is_some_and(|name| RELATIONS.contains(&name.as_str()));
        if named && typeorm_declaration(types, &callee).is_some() {
            return Some(expression);
        }
    }
    None
}

fn is_promise_typed(declaration: &At) -> bool {
    let kind = declaration.child("type").filter(|kind| kind.is(k::TYPE_REFERENCE));
    kind.and_then(|kind| kind.child("typeName")).is_some_and(|name| source_of(&name) == "Promise")
}

fn property_value(object: &At, name: &str) -> Option<At> {
    let property = object.listed("properties").into_iter().find(|each| each.is(k::PROPERTY_ASSIGNMENT) && each.child("name").is_some_and(|key| source_of(&key) == name))?;
    property.child("initializer")
}

fn schema_relations(types: &mut Types, node: &At) -> Vec<SchemaRelation> {
    let Some(expression) = node.child("expression") else { return Vec::new() };
    let callee = if expression.is(k::PROPERTY_ACCESS_EXPRESSION) { expression.child("name") } else { Some(expression) };
    let options = node.listed("arguments").into_iter().next();
    let (Some(callee), Some(options)) = (callee, options) else { return Vec::new() };
    if callee.identifier().as_deref() != Some(ENTITY_SCHEMA) || !options.is(k::OBJECT_LITERAL_EXPRESSION) || typeorm_declaration(types, &callee).is_none() {
        return Vec::new();
    }
    let Some(relations) = property_value(&options, "relations").filter(|relations| relations.is(k::OBJECT_LITERAL_EXPRESSION)) else { return Vec::new() };
    let type_name = node.listed("typeArguments").first().map(source_of);
    let named = property_value(&options, "name").filter(|name| name.is(k::STRING_LITERAL)).and_then(|name| name.text());
    let entity = named.or_else(|| type_name.clone());
    relations
        .listed("properties")
        .into_iter()
        .filter(|each| each.is(k::PROPERTY_ASSIGNMENT) && each.child("initializer").is_some_and(|value| is_true_option(&value, "lazy")))
        .filter_map(|each| each.child("name"))
        .map(|name| SchemaRelation { entity: entity.clone(), type_name: type_name.clone(), relation: source_of(&name) })
        .collect()
}

/// One walk over every file that mentions `EntitySchema`, breadth first across all of them at once, as the
/// plugin's single queue visits them.
fn build_index(types: &mut Types) -> Vec<SchemaRelation> {
    let mut pending = VecDeque::new();
    for file in types.program_files() {
        if is_declaration_file(&file) || !CODE.iter().any(|extension| file.ends_with(extension)) {
            continue;
        }
        if std::fs::read_to_string(&file).is_ok_and(|text| !text.contains(ENTITY_SCHEMA)) {
            continue;
        }
        let Some(table) = types.table_of(&file) else { return Vec::new() };
        pending.push_back(At { table, path: file.as_str().into(), index: 1 });
    }
    let mut found = Vec::new();
    while let Some(node) = pending.pop_front() {
        if node.is(k::NEW_EXPRESSION) {
            found.extend(schema_relations(types, &node));
        }
        pending.extend(node.children());
    }
    found
}

fn schema_relation(types: &mut Types, schemas: &mut Schemas, access: &Access) -> Option<Relation> {
    if schemas.0.is_none() {
        let built = build_index(types);
        if types.refused.is_some() {
            return None;
        }
        schemas.0 = Some(built);
    }
    let candidates: Vec<SchemaRelation> = schemas.0.iter().flatten().filter(|each| each.relation == access.name).cloned().collect();
    if candidates.is_empty() {
        return None;
    }
    let (any, type_name) = types.type_name_at_handle(&access.expression.handle())?;
    let open = any || type_name.as_deref().is_none_or(|name| OPEN_TYPES.contains(&name));
    let wanted = type_name.as_deref();
    let matched = candidates.iter().find(|each| each.type_name.as_deref() == wanted || each.entity.as_deref() == wanted);
    let matched = matched.or(if open { candidates.first() } else { None })?;
    Some(Relation { entity: matched.entity.clone().unwrap_or_else(|| "entity".to_string()), relation: access.name.to_string() })
}

/// `decoratedRelation`.
pub fn decorated_relation(types: &mut Types, schemas: &mut Schemas, access: &Access) -> Option<Relation> {
    if let Some(declaration) = access.declarations.iter().find(|declaration| declaration.is(k::PROPERTY_DECLARATION)) {
        let decorator = relation_decorator(types, declaration);
        let lazy = decorator.as_ref().is_some_and(|decorator| decorator.listed("arguments").iter().any(|argument| is_true_option(argument, "lazy")));
        if lazy || (decorator.is_some() && is_promise_typed(declaration)) {
            let entity = declaration.parent().and_then(|owner| owner.child("name")).and_then(|name| name.identifier());
            return Some(Relation { entity: entity.unwrap_or_else(|| "entity".to_string()), relation: access.name.to_string() });
        }
    }
    schema_relation(types, schemas, access)
}

/// `tsLazyRelation`: the relation a property access of the compiler's tree reads, when it is lazy.
pub fn ts_lazy_relation(types: &mut Types, schemas: &mut Schemas, member: &At) -> Option<Relation> {
    let name = member.child("name").filter(|name| member.is(k::PROPERTY_ACCESS_EXPRESSION) && name.is(k::IDENTIFIER))?;
    let expression = member.child("expression")?;
    let text = name.text()?;
    let symbol = types.symbol_at_handle(&name.handle());
    let declarations = nodes(types, symbol.as_ref().map(|symbol| symbol.declarations.as_slice()).unwrap_or_default());
    decorated_relation(types, schemas, &Access { expression: &expression, name: &text, declarations })
}
