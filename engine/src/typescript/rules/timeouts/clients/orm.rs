//! `orm-timeouts.mts`: TypeORM, Sequelize and Knex options for Postgres, and Sequelize built from a Postgres URL,
//! judged for a statement timeout.
use super::options::{Options, State, carries_timeout, either, options_of, postgres_options_state, references_of_declared, text_of, text_state};
use super::Timeout;
use crate::typescript::rules::database::modules::{Family, ModuleScope, constructed_name};
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const POSTGRES: &str = "postgres";
const SEQUELIZE: &str = "Sequelize";
const TYPEORM_POSTGRES: [&str; 2] = [POSTGRES, "cockroachdb"];
const KNEX_POSTGRES: [&str; 5] = ["pg", "pg-native", POSTGRES, "postgresql", "cockroachdb"];
const TYPEORM_KEYS: [&str; 4] = ["entities", "autoLoadEntities", "migrations", "migrationsRun"];

static POSTGRES_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^postgres(?:ql)?:").expect("postgres url"));

#[derive(Clone, Copy)]
enum Kind {
    TypeOrm,
    Sequelize,
    Knex,
}

fn key_text(options: &Options, key: &str) -> Option<String> {
    options.value_of(key).and_then(|value| text_of(options.scopes, Some(value)))
}

fn is_in(set: &[&str], value: Option<String>) -> bool {
    value.is_some_and(|value| set.contains(&value.as_str()))
}

fn is_spread_source(scope: &ModuleScope, object: Node) -> bool {
    references_of_declared(scope.scopes, object.parent()).iter().any(|reference| reference.identifier.parent().is_some_and(|parent| parent.is("SpreadElement")))
}

fn knex_state(scope: &ModuleScope, options: &Options) -> State {
    let pool = options_of(scope.scopes, options.value_of("pool"));
    let hook = pool.and_then(|pool| pool.value_of("afterCreate"));
    let connection = options.nested_state("connection", |scopes, node| postgres_options_state(scopes, Some(node)));
    let Some(hook) = hook else { return connection };
    if carries_timeout(scope.source(hook)) {
        return State::Set;
    }
    if is_function_node(hook) { connection } else { either(&[State::Unknown, connection]) }
}

fn type_orm_state(options: &Options) -> State {
    let url = options.value_of("url");
    either(&[
        options.nested_state("extra", |scopes, node| postgres_options_state(scopes, Some(node))),
        if url.is_none() { State::Missing } else { text_state(options.scopes, url, State::Missing) },
    ])
}

fn orm_kind(scope: &ModuleScope, options: &Options) -> Option<Kind> {
    let type_orm = scope.has(Family::TypeOrm) || TYPEORM_KEYS.iter().any(|key| options.value_of(key).is_some());
    if type_orm && is_in(&TYPEORM_POSTGRES, key_text(options, "type")) {
        return Some(Kind::TypeOrm);
    }
    if scope.has(Family::Sequelize) && key_text(options, "dialect").as_deref() == Some(POSTGRES) {
        return Some(Kind::Sequelize);
    }
    let knex = options.value_of("connection").is_some();
    (knex && is_in(&KNEX_POSTGRES, key_text(options, "client"))).then_some(Kind::Knex)
}

/// `ormOptionsTimeout`: an ORM options object for Postgres and its statement timeout.
pub fn orm_options_timeout<'s>(scope: &ModuleScope<'_, '_, 's>, object: Node<'s>) -> Option<Timeout> {
    let options = options_of(scope.scopes, Some(object))?;
    let kind = orm_kind(scope, &options)?;
    if is_spread_source(scope, object) {
        return None;
    }
    let (name, state) = match kind {
        Kind::TypeOrm => ("TypeORM", type_orm_state(&options)),
        Kind::Sequelize => (SEQUELIZE, options.nested_state("dialectOptions", |scopes, node| postgres_options_state(scopes, Some(node)))),
        Kind::Knex => ("Knex", knex_state(scope, &options)),
    };
    Some(Timeout { aws: false, name: Some(name.to_string()), state })
}

fn sequelize_url_state<'s>(scope: &ModuleScope<'_, '_, 's>, arguments: &[Option<Node<'s>>]) -> Option<State> {
    let settings = if arguments.len() > 1 { options_of(scope.scopes, arguments.last().copied().flatten()) } else { None };
    if arguments.len() > 1 && settings.is_none() {
        return Some(State::Unknown);
    }
    if settings.as_ref().is_some_and(|settings| settings.value_of("dialect").is_some()) {
        return None;
    }
    let url = text_state(scope.scopes, arguments.first().copied().flatten(), State::Missing);
    let dialect = match settings {
        None => State::Missing,
        Some(settings) => settings.nested_state("dialectOptions", |scopes, node| postgres_options_state(scopes, Some(node))),
    };
    Some(either(&[url, dialect]))
}

/// `sequelizeUrlTimeout`: `new Sequelize("postgres://...")` and its statement timeout.
pub fn sequelize_url_timeout<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<Timeout> {
    let is_sequelize = node.is("NewExpression") && scope.has(Family::Sequelize) && constructed_name(node).as_deref() == Some(SEQUELIZE);
    let arguments = node.list("arguments");
    let url = if is_sequelize { text_of(scope.scopes, arguments.first().copied().flatten()) } else { None }?;
    if !POSTGRES_URL.is_match(&url) {
        return None;
    }
    let state = sequelize_url_state(scope, &arguments)?;
    Some(Timeout { aws: false, name: Some(SEQUELIZE.to_string()), state })
}
