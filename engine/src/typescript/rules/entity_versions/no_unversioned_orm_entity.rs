//! `no-unversioned-orm-entity`: an entity that is loaded, changed and saved again without a version column lets
//! the later of two concurrent requests silently overwrite the earlier one.
use super::writes::{home_of, is_flush, is_load, is_saved_through, names_of, references_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::versions::Form;

const RULE: &str = "no-unversioned-orm-entity";
const EXCEPTION: &str = "An exception fits only when concurrent writers of the table are ruled out another way, such as a pessimistic lock or a single writer.";
const SAME_ROW: &str = "so two requests that update the same row both succeed and the later one silently overwrites the earlier one.";

fn message(form: Form, entity: &str) -> String {
    let (column, advice) = match form {
        Form::Typeorm => ("a version column", "Add `@VersionColumn() version!: number` to the entity: TypeORM then fails the stale save with an error."),
        Form::Mikro => ("a version property", "Add `@Property({ version: true }) version!: number` to the entity: MikroORM then fails the stale flush with an OptimisticLockError."),
        Form::Sequelize => (
            "a version column",
            "Set `version: true` in the model options (`Model.init(attributes, { sequelize, version: true })`, or `@Table({ version: true })`): Sequelize then fails the stale save with an OptimisticLockError.",
        ),
    };
    format!("`{entity}` is loaded and saved again without {column}, {SAME_ROW} {advice} {EXCEPTION}")
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let mut candidates = Vec::new();
    let mut calls: Vec<(Node, Option<u32>)> = Vec::new();
    for node in view.nodes() {
        if node.is("CallExpression") {
            calls.push((node, home_of(node)));
        } else if node.is("VariableDeclarator") && is_load(node.node("init")) {
            let id = node.node("id").filter(|id| id.is("Identifier"));
            if let Some((id, variable)) = id.and_then(|id| scopes.variable_named(id).map(|variable| (id, variable))) {
                candidates.push((node, id, names_of(scopes, variable), home_of(node)));
            }
        }
    }
    let mut found = Vec::new();
    for (declarator, id, names, home) in candidates {
        let names = references_of(scopes, &names);
        if !names.changed {
            continue;
        }
        let saved = calls.iter().any(|(call, call_home)| *call_home == home && (is_saved_through(*call, &names) || is_flush(*call)));
        if !saved {
            continue;
        }
        let name_end = id.start() + id.name().map_or(0, |name| name.len() as u32);
        let entity = types.borrow_mut().unversioned_entity(id.start(), name_end);
        if types.borrow().refused.is_some() {
            return;
        }
        if let Some(entity) = entity {
            found.push((declarator.start(), declarator.end(), message(entity.form, &entity.name)));
        }
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
