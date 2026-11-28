//! `no-orm-schema-sync`: ORM options and calls that create, alter or drop tables when the application starts
//! (`synchronize`, `dropSchema`, Sequelize `sync()` and `autoLoadModels`, MikroORM schema calls).
use super::modules::{Family, ModuleScope, constructed_name};
use super::options::{has_key, has_opaque_spread, is_orm_options, is_switched_on, object_of, property_key};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{defs, member_name, property_named, unwrapped};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-orm-schema-sync";
const MESSAGE: &str = "lets the ORM create, alter or drop tables when the application starts: a deploy can drop columns and their data, instances race to change the schema, and the schema drifts from what the migrations record. A value guarded by an environment check still changes the schema in every other environment. Change the schema with migrations instead (TypeORM migrations with `migrationsRun` or `typeorm migration:run`, `sequelize-cli db:migrate`, MikroORM `orm.migrator.up()`, `prisma migrate deploy`). An exception fits only for a local script outside the application, such as a seed or a dev tool.";
const SYNCHRONIZE: &str = "synchronize";
const TYPEORM_METHODS: [&str; 2] = [SYNCHRONIZE, "dropDatabase"];
const MIKRO_ORM_METHODS: [&str; 4] = ["updateSchema", "createSchema", "dropSchema", "refreshDatabase"];
const DATA_SOURCE_FACTORIES: [&str; 2] = ["createConnection", "initialize"];
const ENSURE_OPTIONS: [&str; 2] = ["create", "clear"];
const SYNC_KEYS: [&str; 2] = [SYNCHRONIZE, "dropSchema"];

static SEQUELIZE_TEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)sequelize").expect("pattern"));
static DATA_SOURCE_TEXT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)data_?source|connection|database|^(?:this\.)?db$").expect("pattern"));
/// `\w` of a JavaScript `/iu` pattern: ASCII word characters, and the two that case-fold into them.
fn is_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '\u{17F}' || character == '\u{212A}'
}

/// `/\borm\b/iu`.
fn names_orm(text: &str) -> bool {
    let characters: Vec<char> = text.chars().collect();
    characters.windows(3).enumerate().any(|(at, window)| {
        let orm = window.iter().zip("orm".chars()).all(|(written, wanted)| written.to_ascii_lowercase() == wanted);
        let before = at.checked_sub(1).and_then(|index| characters.get(index)).is_some_and(|character| is_word(*character));
        let after = characters.get(at + 3).is_some_and(|character| is_word(*character));
        orm && !before && !after
    })
}

static MODEL_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Z]").expect("pattern"));

fn is_sequelize_construction(scope: &ModuleScope, init: Option<Node>) -> bool {
    let names = scope.orm_locals("Sequelize");
    init.is_some_and(|init| init.is("NewExpression") && constructed_name(init).is_some_and(|name| names.contains(&name)))
}

fn is_model<'s>(scope: &ModuleScope<'_, '_, 's>, receiver: Node<'s>) -> bool {
    let target = unwrapped(receiver);
    let Some(name) = target.name().filter(|name| target.is("Identifier") && MODEL_NAME.is_match(name)) else { return false };
    let declared = defs(scope.scopes, target).first().is_some_and(|definition| definition.kind == DefKind::ClassName);
    declared || scope.binding(&name).is_some_and(|binding| binding.source.starts_with('.'))
}

fn is_sequelize_instance<'s>(scope: &ModuleScope<'_, '_, 's>, receiver: Node<'s>) -> bool {
    SEQUELIZE_TEXT.is_match(scope.source(receiver))
        || is_sequelize_construction(scope, scope.initializer_of(receiver))
        || (scope.has(Family::Sequelize) && is_model(scope, receiver))
}

fn is_data_source<'s>(scope: &ModuleScope<'_, '_, 's>, receiver: Node<'s>) -> bool {
    let init = scope.initializer_of(receiver);
    let made = init.is_some_and(|init| {
        let name = constructed_name(init);
        (init.is("NewExpression") && name.as_deref() == Some("DataSource"))
            || (init.is("CallExpression") && name.is_some_and(|name| DATA_SOURCE_FACTORIES.contains(&name.as_str())))
    });
    made || DATA_SOURCE_TEXT.is_match(scope.source(receiver)) || names_orm(scope.source(receiver))
}

fn ensures_schema<'s>(scope: &ModuleScope<'_, '_, 's>, call: Node<'s>) -> bool {
    let Some(options) = object_of(scope.scopes, call.nodes("arguments").first().copied()) else { return false };
    ENSURE_OPTIONS.iter().any(|key| {
        let value = property_named(scope.scopes, Some(options), key);
        value.is_some() && is_switched_on(scope.scopes, value)
    })
}

fn is_schema_call<'s>(scope: &ModuleScope<'_, '_, 's>, call: Node<'s>, method: &str, receiver: Node<'s>) -> bool {
    if method == "sync" {
        return is_sequelize_instance(scope, receiver);
    }
    if TYPEORM_METHODS.contains(&method) {
        return scope.has(Family::TypeOrm) && is_data_source(scope, receiver);
    }
    if MIKRO_ORM_METHODS.contains(&method) {
        return scope.has(Family::MikroOrm);
    }
    method == "ensureDatabase" && scope.has(Family::MikroOrm) && ensures_schema(scope, call)
}

fn syncs_models<'s>(scope: &ModuleScope<'_, '_, 's>, object: Node<'s>) -> bool {
    scope.has(Family::Sequelize) && !has_key(scope.scopes, object, SYNCHRONIZE) && !has_opaque_spread(scope.scopes, object)
}

fn property_form<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<String> {
    let key = property_key(node)?;
    let object = node.parent().filter(|object| object.is("ObjectExpression"))?;
    let watched = SYNC_KEYS.contains(&key.as_str()) || key == "autoLoadModels";
    if !(watched && is_orm_options(scope, object) && is_switched_on(scope.scopes, node.node("value"))) {
        return None;
    }
    if SYNC_KEYS.contains(&key.as_str()) {
        let value = node.node("value").and_then(|value| scope.short_text(value)).unwrap_or("true");
        return Some(format!("{key}: {value}"));
    }
    syncs_models(scope, object).then(|| "autoLoadModels: true` without `synchronize: false".to_string())
}

fn call_form<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<String> {
    let callee = unwrapped(node.node("callee")?);
    if !callee.is("MemberExpression") {
        return None;
    }
    let method = member_name(callee)?;
    let receiver = callee.node("object")?;
    if scope.is_foreign_receiver(receiver) || !is_schema_call(scope, node, &method, receiver) {
        return None;
    }
    Some(match scope.short_text(receiver) {
        Some(receiver) => format!("{receiver}.{method}()"),
        None => format!("{method}()"),
    })
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let scope = ModuleScope::of(view, scopes, context.file.text);
    let mut found = Vec::new();
    for node in view.nodes() {
        let form = match node.kind() {
            "Property" => property_form(&scope, node),
            "CallExpression" => call_form(&scope, node),
            _ => None,
        };
        found.extend(form.map(|form| (node.start(), node.end(), form)));
    }
    for (start, end, form) in found {
        context.report_range(RULE, start, Some(end), format!("`{form}` {MESSAGE}"));
    }
}
