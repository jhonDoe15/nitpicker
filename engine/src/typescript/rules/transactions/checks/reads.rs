//! `check-then-write.mts`: the plain reads of a function, and the write a read decides: under a condition on the
//! read's result, and not made atomic by its own text.
use super::super::branches::ends_in_exit;
use super::super::clients::opener_callback;
use super::super::units::{OrmCall, in_held_transaction};
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::held_scopes::scopes::Held;
use crate::typescript::rules::jobs::item_work::is_consumed;
use crate::typescript::rules::orm_sites::builders::step_in;
use crate::typescript::rules::orm_sites::{OrmKind, orm_site};
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const WRAPPERS: [&str; 5] = ["AwaitExpression", "ChainExpression", "TSNonNullExpression", "TSAsExpression", "TSSatisfiesExpression"];
const AGGREGATES: [&str; 7] = ["count", "countBy", "exist", "exists", "existsBy", "aggregate", "groupBy"];
const INSERTS: [&str; 10] = ["create", "createMany", "createManyAndReturn", "bulkCreate", "insert", "insertInto", "insertMany", "nativeInsert", "persist", "persistAndFlush"];

static LOCKED: LazyLock<Regex> = LazyLock::new(|| js_pattern(r"lock|forUpdate|for update|forShare|pessimistic|skipLocked", true));
static ATOMIC: LazyLock<Regex> =
    LazyLock::new(|| js_pattern(r"on\s*conflict|onDuplicate|orIgnore|orUpdate|upsert|findOrCreate|\bversion\b|revision|updatedAt", true));

/// What the checks of one function share.
pub struct Unit<'h, 'a, 'v> {
    pub held: &'h mut Held<'a, 'v>,
    pub text: &'v str,
    pub body: Node<'v>,
    pub program: Node<'v>,
}

fn source<'v>(text: &'v str, node: Node) -> &'v str {
    text.get(node.start() as usize..node.end() as usize).unwrap_or_default()
}

fn matches(pattern: &Regex, text: &str) -> bool {
    pattern.is_match(&Folded::of(text).text)
}

/// `unitReads`.
pub fn unit_reads<'v>(unit: &mut Unit<'_, '_, 'v>, orms: &[String]) -> Vec<OrmCall<'v>> {
    let mut found = Vec::new();
    for call in calls_within(unit.body).into_iter().filter(|call| call.is("CallExpression") && is_consumed(*call)) {
        let Some(site) = orm_site(call, OrmKind::Read, orms).filter(|site| site.site.table.is_some()) else { continue };
        let plain = opener_callback(call).is_none() && !in_held_transaction(unit.held, call, unit.program) && !matches(&LOCKED, source(unit.text, call));
        if plain {
            found.push(OrmCall { call, site });
        }
    }
    found
}

fn reads_name(node: Node, name: &str) -> bool {
    node.descendants().into_iter().any(|each| each.is("Identifier") && each.name().as_deref() == Some(name))
}

fn bound_name(call: Node) -> Option<String> {
    let mut outer = call;
    while let Some(parent) = outer.parent().filter(|parent| WRAPPERS.contains(&parent.kind())) {
        outer = parent;
    }
    let holder = outer.parent().filter(|holder| holder.is("VariableDeclarator"))?;
    let id = holder.node("id").filter(|id| id.is("Identifier"))?;
    id.name().map(|name| name.into_owned())
}

fn decides_write(read: &OrmCall, write: &OrmCall) -> bool {
    if read.site.chain.steps.iter().any(|step| step_in(&AGGREGATES, Some(step))) {
        return true;
    }
    if write.site.chain.steps.iter().any(|step| step_in(&INSERTS, Some(step))) {
        return true;
    }
    let saves = write.site.chain.steps.last().and_then(|step| step.name.as_deref()) == Some("save");
    saves && bound_name(read.call).is_none_or(|name| !write.call.nodes("arguments").into_iter().any(|argument| reads_name(argument, &name)))
}

fn deciding_conditions<'v>(read: &OrmCall<'v>, body: Node<'v>) -> Vec<Node<'v>> {
    let Some(name) = bound_name(read.call) else {
        let direct = read.call.ancestors().find(|node| node.is("IfStatement") && node.node("test").is_some_and(|test| test.contains(read.call)));
        return direct.into_iter().collect();
    };
    body.descendants()
        .into_iter()
        .filter(|node| node.is("IfStatement") && node.start() > read.call.end() && node.node("test").is_some_and(|test| reads_name(test, &name)))
        .collect()
}

fn governs(condition: Node, write: &OrmCall) -> bool {
    let inside = [condition.node("consequent"), condition.node("alternate")].into_iter().flatten().any(|branch| branch.contains(write.call));
    let guarded = ends_in_exit(condition.node("consequent"))
        && condition.node("alternate").is_none()
        && write.call.start() > condition.end()
        && condition.parent().is_some_and(|parent| parent.contains(write.call));
    inside || guarded
}

/// `decidedWrite`.
pub fn decided_write<'w, 'v>(unit: &Unit<'_, '_, 'v>, read: &OrmCall<'v>, writes: &'w [OrmCall<'v>]) -> Option<&'w OrmCall<'v>> {
    let conditions = deciding_conditions(read, unit.body);
    writes.iter().find(|write| {
        write.site.site.table == read.site.site.table
            && decides_write(read, write)
            && write.call.start() > read.call.end()
            && conditions.iter().any(|condition| governs(*condition, write))
            && !matches(&ATOMIC, source(unit.text, write.call))
    })
}
