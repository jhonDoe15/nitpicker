//! `schema-fields.mts` and `problem-types.mts`: the fields of a schema whose leaf rejects or misreads request text.
pub mod dto;
pub mod libraries;
pub mod shapes;

use self::libraries::{library_call, listed, method_call, LibraryCall};
use self::shapes::{shape_fields, Field};
use super::bindings::resolved_expression;
use super::tree::{is_bigint, is_boolean, is_number, member_text, Tree, T};

const MAX_DEPTH: usize = 4;
const MAX_LEAF_STEPS: usize = 16;
const OPEN_METHODS: [&str; 3] = ["or", "and", "catch"];
const INTEGERS: [&str; 3] = ["int", "int32", "uint32"];

#[derive(Clone, PartialEq, Debug)]
pub enum Kind {
    Number,
    Integer,
    Bigint,
    Boolean,
    Date,
    /// What a plain object lookup gives for a name it inherits: no kind the rule names.
    Other(String),
}

#[derive(Clone)]
pub struct Problem {
    pub kind: Kind,
    pub cast: bool,
    pub form: String,
    pub library: &'static str,
    pub fix: Option<String>,
}

#[derive(Clone)]
pub struct Finding<'v> {
    pub field: String,
    pub node: T<'v>,
    pub problem: Problem,
}

fn literal_kind(argument: Option<T>) -> Option<Kind> {
    let node = argument?.bare()?;
    if is_bigint(node) {
        return Some(Kind::Bigint);
    }
    if is_number(node) {
        return Some(Kind::Number);
    }
    is_boolean(node).then_some(Kind::Boolean)
}

fn call_problem(tree: &Tree, call: T, found: &LibraryCall) -> Option<Problem> {
    if found.coerce {
        let display = found.display.clone().unwrap_or_default();
        return (found.name.as_deref() == Some("boolean")).then_some(Problem { kind: Kind::Boolean, cast: true, form: display, library: found.library.id, fix: None });
    }
    let first = tree.fields(call.node, "arguments").first().copied().flatten();
    let kind = found.name.as_deref().and_then(|name| found.library.kind(name)).or_else(|| if found.name.as_deref() == Some("literal") { literal_kind(first) } else { None })?;
    let form = found.display.clone().unwrap_or_else(|| format!("{}()", found.name.as_deref().unwrap_or_default()));
    let integer = found.library.id == "zod" && listed(&INTEGERS, found.name.as_deref());
    Some(Problem { kind: if integer { Kind::Integer } else { kind }, cast: false, form, library: found.library.id, fix: None })
}

enum LeafStep<'v> {
    Next(Option<T<'v>>),
    Done(Option<Problem>),
}

fn leaf_step<'v>(tree: &Tree<'v>, node: T<'v>) -> LeafStep<'v> {
    if let Some(callee) = method_call(tree, node) {
        let method = member_text(callee).unwrap_or_default();
        return if OPEN_METHODS.contains(&method.as_str()) { LeafStep::Done(None) } else { LeafStep::Next(tree.field(callee, "object")) };
    }
    if !node.is("CallExpression") {
        return LeafStep::Done(None);
    }
    let Some(found) = library_call(tree, node) else { return LeafStep::Done(None) };
    if !found.coerce && listed(found.library.wrappers, found.name.as_deref()) {
        return LeafStep::Next(tree.fields(node.node, "arguments").first().copied().flatten());
    }
    LeafStep::Done(call_problem(tree, node, &found))
}

pub fn leaf_problem<'v>(tree: &Tree<'v>, expression: Option<T<'v>>) -> Option<Problem> {
    let mut pending = vec![expression];
    let mut index = 0;
    while index < pending.len() {
        let node = resolved_expression(tree, pending[index]);
        index += 1;
        let step = match node {
            Some(node) if pending.len() <= MAX_LEAF_STEPS => leaf_step(tree, node),
            _ => LeafStep::Done(None),
        };
        match step {
            LeafStep::Next(Some(next)) => pending.push(Some(next)),
            LeafStep::Next(None) => return None,
            LeafStep::Done(problem) => return problem,
        }
    }
    None
}

struct Level<'v> {
    fields: Vec<Field<'v>>,
    prefix: String,
    depth: usize,
}

pub fn schema_problems<'v>(tree: &Tree<'v>, expression: Option<T<'v>>) -> Option<Vec<Finding<'v>>> {
    let fields = shape_fields(tree, expression)?;
    let mut pending = vec![Level { fields, prefix: String::new(), depth: 0 }];
    let mut problems = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let mut nested = Vec::new();
        let level = &pending[index];
        for Field { name, value } in &level.fields {
            let field = format!("{}{name}", level.prefix);
            let problem = leaf_problem(tree, Some(*value));
            let inner = if problem.is_none() && level.depth < MAX_DEPTH { shape_fields(tree, Some(*value)) } else { None };
            if let Some(problem) = problem {
                problems.push(Finding { field: field.clone(), node: *value, problem });
            }
            if let Some(inner) = inner {
                nested.push(Level { fields: inner, prefix: format!("{field}."), depth: level.depth + 1 });
            }
        }
        pending.extend(nested);
        index += 1;
    }
    Some(problems)
}
