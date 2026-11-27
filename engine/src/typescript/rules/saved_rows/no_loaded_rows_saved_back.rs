//! `no-loaded-rows-saved-back`: loading query rows only to change or delete every one of them the same way.
use crate::typescript::rules::Context;
use crate::typescript::rules::query_rows::calls::{MIKRO_ORM, QueryScope, SEQUELIZE, TYPEORM, is_query_result, query_scope};
use crate::typescript::rules::query_rows::loaded::{is_projection, loaded_rows};
use crate::typescript::rules::query_rows::writes::{Rows, UPDATE};
use crate::typescript::rules::typed::rows::{HookIndex, HookStatus};

const RULE: &str = "no-loaded-rows-saved-back";
const EXCEPTION: &str = "An exception fits only when the model has hooks, subscribers, a version column or a cascade that a bulk statement skips.";
const UPDATED: &str = "These rows are loaded only to be changed the same way and written back. Update them in one statement: update(criteria, values) (TypeORM), updateMany (Prisma), Model.update(values, { where }) (Sequelize), nativeUpdate (MikroORM), or update().set().where() (Drizzle).";
const DELETED: &str = "These rows are loaded only to be deleted. Delete them in one statement: delete(criteria) (TypeORM), deleteMany (Prisma), destroy({ where }) (Sequelize), nativeDelete (MikroORM), or delete().where() (Drizzle).";
const CLASS_FAMILIES: [&str; 3] = [TYPEORM, SEQUELIZE, MIKRO_ORM];

fn is_hook_free(scope: &QueryScope, status: HookStatus) -> bool {
    if status == HookStatus::Unknown {
        return !CLASS_FAMILIES.iter().any(|family| scope.families.contains(family));
    }
    status != HookStatus::Hooked
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    if types.borrow().refused.is_some() {
        return;
    }
    let scope = query_scope(view.program());
    let rows = Rows { scopes, source: context.file.text };
    let mut index: HookIndex = types.borrow_mut().take_store();
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("AwaitExpression")) {
        if !is_query_result(&scope, node) {
            continue;
        }
        let query = node.node("argument").filter(|query| query.is("CallExpression"));
        let loaded = loaded_rows(scopes, node);
        let (Some(loaded), Some(query)) = (loaded, query) else { continue };
        if is_projection(query) {
            continue;
        }
        let Some(shape) = rows.write_shape(&loaded, query) else { continue };
        let status = types.borrow_mut().hook_status(node.start(), node.end(), &mut index);
        if types.borrow().refused.is_some() {
            break;
        }
        if is_hook_free(&scope, status) {
            found.push(shape);
        }
    }
    let refused = types.borrow().refused.is_some();
    types.borrow_mut().put_store(index);
    if refused {
        return;
    }
    for shape in found {
        let text = if shape.shape == UPDATE { UPDATED } else { DELETED };
        context.report_range(RULE, shape.node.start(), Some(shape.node.end()), format!("{text} {EXCEPTION}"));
    }
}
