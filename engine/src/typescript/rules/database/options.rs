//! `orm-options.mts`: whether an object literal configures an ORM or a query builder, and whether a value turns
//! an option on (`true`, a condition, an environment read).
use super::modules::{ModuleScope, callee_label, constructed_name};
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{is_function_node, is_true, member_name, property_named, resolved_value, static_key, string_value, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const TYPEORM_DRIVERS: [&str; 19] = [
    "postgres", "mysql", "mariadb", "sqlite", "better-sqlite3", "mssql", "oracle", "cockroachdb", "sqljs", "mongodb", "aurora-mysql",
    "aurora-postgres", "sap", "spanner", "capacitor", "cordova", "expo", "nativescript", "react-native",
];
const KNEX_CLIENTS: [&str; 12] = ["pg", "pg-native", "postgres", "postgresql", "mysql", "mysql2", "sqlite3", "better-sqlite3", "oracledb", "mssql", "tedious", "cockroachdb"];
const TYPEORM_KEYS: [&str; 4] = ["entities", "autoLoadEntities", "migrations", "migrationsRun"];
const ORM_CALLS: [&str; 8] = ["createConnection", "TypeOrmModule.forRoot", "SequelizeModule.forRoot", "MikroOrmModule.forRoot", "MikroORM.init", "defineConfig", "knex", "Knex"];
const ORM_CONSTRUCTORS: [&str; 2] = ["DataSource", "Sequelize"];
const ASYNC_ROOT: &str = "Module.forRootAsync";
pub const CONDITION_OPERATORS: [&str; 8] = ["===", "!==", "==", "!=", "<", "<=", ">", ">="];
const BRANCHES: [&str; 4] = ["IfStatement", "ConditionalExpression", "LogicalExpression", "SwitchStatement"];

fn named(list: &[&str], value: Option<&str>) -> bool {
    value.is_some_and(|value| list.contains(&value))
}

/// `isEnvRead`: `process.env.NAME`.
pub fn is_env_read(node: Node) -> bool {
    let target = unwrapped(node);
    let owner = target.node("object").filter(|_| target.is("MemberExpression")).map(unwrapped);
    owner.is_some_and(|owner| {
        let object = owner.node("object");
        owner.is("MemberExpression")
            && member_name(owner).as_deref() == Some("env")
            && object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("process"))
    })
}

fn is_boolean_cast(node: Node) -> bool {
    let callee = node.node("callee").filter(|_| node.is("CallExpression"));
    callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Boolean"))
}

/// `isTestExpression`.
pub fn is_test_expression(leaf: Node, operators: &[&str]) -> bool {
    let target = unwrapped(leaf);
    (target.is("BinaryExpression") && named(operators, target.text("operator").as_deref()))
        || (target.is("UnaryExpression") && target.text("operator").as_deref() == Some("!"))
        || is_env_read(target)
}

/// `isCondition`.
pub fn is_condition(leaf: Node) -> bool {
    is_test_expression(leaf, &CONDITION_OPERATORS) || is_boolean_cast(unwrapped(leaf))
}

/// `isSwitchedOn`: one of the values is `true` or a condition.
pub fn is_switched_on<'s>(scopes: &Scopes<'_, 's>, value: Option<Node<'s>>) -> bool {
    leaf_values(scopes, value).into_iter().any(|leaf| is_true(leaf) || is_condition(leaf))
}

/// `isUnconditionalFunction`: a function with no branch in its body.
pub fn is_unconditional_function(leaf: Node) -> bool {
    if !is_function_node(leaf) {
        return false;
    }
    let body = leaf.node("body");
    !body.is_some_and(|body| body.descendants().into_iter().any(|node| BRANCHES.contains(&node.kind())))
}

/// `arrayTexts`: the string values of an array constant's elements.
pub fn array_texts<'s>(scopes: &Scopes<'_, 's>, leaf: Node<'s>) -> Vec<Option<String>> {
    let Some(array) = resolved_value(scopes, Some(leaf)).filter(|array| array.is("ArrayExpression")) else { return Vec::new() };
    array.nodes("elements").into_iter().flat_map(|element| leaf_values(scopes, Some(element)).into_iter().map(|value| string_value(Some(value)))).collect()
}

/// `objectOf`.
pub fn object_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    resolved_value(scopes, node).filter(|object| object.is("ObjectExpression"))
}

/// `hasKey`.
pub fn has_key<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>, key: &str) -> bool {
    property_named(scopes, Some(object), key).is_some()
}

/// `hasOpaqueSpread`: a spread of something that is no object constant.
pub fn has_opaque_spread<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>) -> bool {
    object.nodes("properties").into_iter().any(|entry| entry.is("SpreadElement") && object_of(scopes, entry.node("argument")).is_none())
}

/// `textOf`: the string a key of an object constant holds.
pub fn text_of<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>, key: &str) -> Option<String> {
    let value = property_named(scopes, Some(object), key)?;
    string_value(resolved_value(scopes, Some(value)))
}

fn is_type_orm_shaped<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>) -> bool {
    TYPEORM_KEYS.iter().any(|key| has_key(scopes, object, key)) || named(&TYPEORM_DRIVERS, text_of(scopes, object, "type").as_deref())
}

fn is_mikro_orm_shaped<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>) -> bool {
    has_key(scopes, object, "dbName") || (has_key(scopes, object, "driver") && has_key(scopes, object, "entities"))
}

fn is_orm_call_argument(object: Node) -> bool {
    let Some(call) = object.parent().filter(|call| matches!(call.kind(), "CallExpression" | "NewExpression")) else { return false };
    if !call.nodes("arguments").contains(&object) {
        return false;
    }
    named(&ORM_CALLS, callee_label(call).as_deref()) || (call.is("NewExpression") && named(&ORM_CONSTRUCTORS, constructed_name(call).as_deref()))
}

fn factory_of(object: Node) -> Option<Node> {
    let parent = object.parent()?;
    if is_function_node(parent) && parent.node("body") == Some(object) {
        return Some(parent);
    }
    let block = parent.parent().filter(|block| parent.is("ReturnStatement") && block.is("BlockStatement"))?;
    block.parent().filter(|function| is_function_node(*function))
}

/// `factoryCall`: the `*Module.forRootAsync({ useFactory })` call whose factory returns the object.
pub fn factory_call(object: Node) -> Option<Node> {
    let property = factory_of(object)?.parent().filter(|property| property.is("Property") && static_key(*property).as_deref() == Some("useFactory"))?;
    let call = property.parent()?.parent().filter(|call| call.is("CallExpression"))?;
    callee_label(call).is_some_and(|label| label.ends_with(ASYNC_ROOT)).then_some(call)
}

/// `isOrmOptions`: the object is shaped like, or passed as, the options of an ORM or query builder.
pub fn is_orm_options(scope: &ModuleScope, object: Node) -> bool {
    let scopes = scope.scopes;
    is_type_orm_shaped(scopes, object)
        || has_key(scopes, object, "dialect")
        || is_mikro_orm_shaped(scopes, object)
        || named(&KNEX_CLIENTS, text_of(scopes, object, "client").as_deref())
        || is_orm_call_argument(object)
        || (!scope.families.is_empty() && factory_call(object).is_some())
}

/// `propertyKey`: the static key of a property of an object literal.
pub fn property_key(node: Node) -> Option<String> {
    if node.parent().is_some_and(|parent| parent.is("ObjectExpression")) { static_key(node) } else { None }
}
