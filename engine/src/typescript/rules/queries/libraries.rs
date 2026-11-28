//! `chain-libraries.mts`: the query builder libraries a file imports and the library a chain of steps builds
//! with. Without type information only the imports and the step names count.
use crate::typescript::rules::database::modules::ModuleScope;
use crate::typescript::rules::security_values::{member_name, string_value, unwrapped};
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Library {
    Kysely,
    Knex,
    QueryBuilder,
    Drizzle,
}

const SELECT_STEPS: [&str; 5] = ["select", "selectDistinct", "selectDistinctOn", "from", "distinct"];
const BUILTIN_ROOTS: [&str; 7] = ["Array", "Iterator", "Object", "Promise", "Buffer", "Observable", "Readable"];

/// `libraryOf`.
pub fn library_of(source: &str) -> Option<Library> {
    if source == "kysely" || source.starts_with("kysely/") {
        return Some(Library::Kysely);
    }
    if source == "knex" {
        return Some(Library::Knex);
    }
    if source == "typeorm" || source == "@nestjs/typeorm" || source.starts_with("@mikro-orm/") {
        return Some(Library::QueryBuilder);
    }
    (source == "drizzle-orm" || source.starts_with("drizzle-orm/")).then_some(Library::Drizzle)
}

/// `queryScope`: the module scope with the query libraries its bindings come from.
pub struct QueryScope<'c, 'a, 's> {
    pub module: ModuleScope<'c, 'a, 's>,
    pub libraries: Vec<Library>,
}

impl<'c, 'a, 's> QueryScope<'c, 'a, 's> {
    pub fn of(module: ModuleScope<'c, 'a, 's>) -> QueryScope<'c, 'a, 's> {
        let mut libraries = Vec::new();
        for library in module.sources().filter_map(library_of) {
            if !libraries.contains(&library) {
                libraries.push(library);
            }
        }
        QueryScope { module, libraries }
    }

    pub fn has(&self, library: Library) -> bool {
        self.libraries.contains(&library)
    }
}

fn root_name(root: Option<Node>) -> Option<String> {
    let target = unwrapped(root?);
    if target.is("Identifier") {
        return target.name().map(|name| name.into_owned());
    }
    if target.is("MemberExpression") { member_name(target) } else { None }
}

fn is_knex_call(scope: &QueryScope, root: Option<Node>) -> bool {
    let Some(call) = root.filter(|root| root.is("CallExpression")) else { return false };
    let name = root_name(call.node("callee"));
    let arguments = call.nodes("arguments");
    let table = string_value(arguments.first().copied().map(unwrapped)).is_some();
    name.as_deref() == Some("knex") || (table && scope.has(Library::Knex) && arguments.len() == 1)
}

fn has(names: &[Option<String>], wanted: &str) -> bool {
    names.iter().any(|name| name.as_deref() == Some(wanted))
}

fn step_library(scope: &QueryScope, root: Option<Node>, names: &[Option<String>]) -> Option<Library> {
    if has(names, "selectFrom") {
        return Some(Library::Kysely);
    }
    if has(names, "createQueryBuilder") {
        return Some(Library::QueryBuilder);
    }
    let name = root_name(root);
    if name.as_deref() == Some("knex") && SELECT_STEPS.iter().any(|step| has(names, step)) {
        return Some(Library::Knex);
    }
    let imported = [Library::Drizzle, Library::Knex].into_iter().find(|library| scope.has(*library));
    let builtin = name.is_some_and(|name| BUILTIN_ROOTS.contains(&name.as_str()));
    if has(names, "from") && !builtin { imported } else { None }
}

/// `chainLibrary`: the library a chain from `root` with steps of these names builds with.
pub fn chain_library(scope: &QueryScope, root: Option<Node>, names: &[Option<String>]) -> Option<Library> {
    if is_knex_call(scope, root) {
        return Some(Library::Knex);
    }
    step_library(scope, root, names)
}
