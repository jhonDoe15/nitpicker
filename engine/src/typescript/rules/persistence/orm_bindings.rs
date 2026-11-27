//! `orm-bindings.mts`: which ORM a name was imported from, and the objects and properties a mapping is written with.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;
use crate::typescript::rules::time_zones::bindings::{Binding, library_binding};
use crate::typescript::rules::writes::syntax::constant_initializer;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Orm {
    TypeOrm,
    MikroOrm,
    Sequelize,
}

pub const DECORATED: [Orm; 2] = [Orm::TypeOrm, Orm::MikroOrm];
const ASSERTION_WRAPPERS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression"];

fn packages(orm: Orm) -> &'static [&'static str] {
    match orm {
        Orm::TypeOrm => &["typeorm"],
        Orm::MikroOrm => &["@mikro-orm"],
        Orm::Sequelize => &["sequelize", "sequelize-typescript", "@sequelize/core"],
    }
}

/// `staticKeyName`: the key of a property or the property of a member access, when it is written out.
pub fn static_key_name(owner: Node) -> Option<String> {
    if owner.flag("computed") {
        return None;
    }
    let key = if owner.has("key") { owner.node("key") } else { owner.node("property") }?;
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    string_literal(Some(key))
}

/// ESLint gives a named class a variable of its own name in the class scope, decorators included, so inside the
/// class that name never reaches an import of the same name.
fn names_own_class(identifier: Node) -> bool {
    let name = identifier.name();
    identifier.ancestors().any(|class| {
        matches!(class.kind(), "ClassDeclaration" | "ClassExpression") && class.node("id").is_some_and(|id| id != identifier && id.name() == name)
    })
}

fn binding_of<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>, orm: Orm) -> Option<Binding> {
    if names_own_class(identifier) {
        return None;
    }
    library_binding(scopes, identifier, packages(orm))
}

/// `importedName`: the name the ORM exports a callee under, through a named import or a namespace member.
pub fn imported_name<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, orm: Orm) -> Option<String> {
    if node.is("Identifier") {
        let binding = binding_of(scopes, node, orm)?;
        return binding.name.or_else(|| node.name().map(|name| name.into_owned()));
    }
    let object = node.node("object").filter(|object| node.is("MemberExpression") && object.is("Identifier"))?;
    let binding = binding_of(scopes, object, orm)?;
    if binding.name.is_none() { static_key_name(node) } else { None }
}

/// `ormOf`: the decorated ORM a callee comes from, when its name is one of `names`.
pub fn orm_of<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, names: &[&str]) -> Option<(Orm, String)> {
    DECORATED.into_iter().find_map(|orm| imported_name(scopes, callee, orm).filter(|name| names.contains(&name.as_str())).map(|name| (orm, name)))
}

fn is_orm_source(source: &str, orm: Orm) -> bool {
    packages(orm).iter().any(|name| source == *name || source.strip_prefix(name).is_some_and(|rest| rest.starts_with('/')))
}

/// `requiredLiteral`: the string a `require('...')` initializer loads.
fn required_source(declarator: Node) -> Option<String> {
    let init = declarator.node("init").filter(|init| init.is("CallExpression"))?;
    init.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"))?;
    string_literal(init.nodes("arguments").first().copied())
}

fn statement_sources(statement: Node) -> Vec<String> {
    if statement.is("ImportDeclaration") {
        return string_literal(statement.node("source")).into_iter().collect();
    }
    if statement.is("VariableDeclaration") {
        return statement.nodes("declarations").into_iter().filter_map(required_source).collect();
    }
    Vec::new()
}

/// `importsOrm`: whether a top-level import or `require` of the file loads the ORM.
pub fn imports_orm(program: Node, orm: Orm) -> bool {
    program.nodes("body").into_iter().flat_map(statement_sources).any(|source| is_orm_source(&source, orm))
}

fn without_assertions(node: Node) -> Node {
    unwrap(node, ASSERTION_WRAPPERS)
}

/// `valueOf`: the expression under type assertions, or the initializer of the `const` it names.
pub fn value_of<'s>(scopes: &Scopes<'_, 's>, expression: Node<'s>) -> Node<'s> {
    let node = without_assertions(expression);
    if node.is("Identifier") { constant_initializer(scopes, node).map(without_assertions).unwrap_or(node) } else { node }
}

/// `objectOf`: an object literal, written in place or as the initializer of a `const`.
pub fn object_of<'s>(scopes: &Scopes<'_, 's>, expression: Option<Node<'s>>) -> Option<Node<'s>> {
    let node = without_assertions(expression?);
    if node.is("ObjectExpression") {
        return Some(node);
    }
    if node.is("Identifier") {
        return constant_initializer(scopes, node).map(without_assertions).filter(|value| value.is("ObjectExpression"));
    }
    None
}

/// A `Map` of property nodes by key: a later key replaces the value and keeps the first key's place.
#[derive(Default)]
pub struct Properties<'s> {
    entries: Vec<(String, Node<'s>)>,
}

impl<'s> Properties<'s> {
    fn set(&mut self, key: String, property: Node<'s>) {
        match self.entries.iter_mut().find(|(known, _)| *known == key) {
            Some(entry) => entry.1 = property,
            None => self.entries.push((key, property)),
        }
    }

    pub fn get(&self, key: &str) -> Option<Node<'s>> {
        self.entries.iter().find(|(known, _)| known == key).map(|(_, property)| *property)
    }

    pub fn values(&self) -> impl Iterator<Item = Node<'s>> + '_ {
        self.entries.iter().map(|(_, property)| *property)
    }

    fn extend(&mut self, other: Properties<'s>) {
        for (key, property) in other.entries {
            self.set(key, property);
        }
    }
}

fn spread_properties<'s>(scopes: &Scopes<'_, 's>, spread: Node<'s>) -> Vec<Node<'s>> {
    let object = object_of(scopes, spread.node("argument"));
    object.map(|object| object.nodes("properties").into_iter().filter(|inner| inner.is("Property")).collect()).unwrap_or_default()
}

/// `propertiesOf`: the properties of an object literal by key, those of spread `const` objects included.
pub fn properties_of<'s>(scopes: &Scopes<'_, 's>, object: Option<Node<'s>>) -> Properties<'s> {
    let mut found = Properties::default();
    let listed = object.map(|object| object.nodes("properties")).unwrap_or_default();
    for property in listed {
        let expanded = if property.is("SpreadElement") { spread_properties(scopes, property) } else { vec![property] };
        for property in expanded {
            if let Some(key) = static_key_name(property) {
                found.set(key, property);
            }
        }
    }
    found
}

/// `mergedProperties`: the properties of every object argument, later arguments winning.
pub fn merged_properties<'s>(scopes: &Scopes<'_, 's>, arguments: &[Node<'s>]) -> Properties<'s> {
    let mut found = Properties::default();
    for argument in arguments {
        found.extend(properties_of(scopes, object_of(scopes, Some(*argument))));
    }
    found
}
