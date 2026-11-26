//! `isCatchingFunction` on the compiler's tree of a function that may be declared in any file of the program: an
//! async function whose body is only `try` statements with a `catch` that neither raises nor hands a promise on.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::{kind as k, node_flags};
use std::rc::Rc;

#[derive(Clone, Copy)]
enum Probe {
    Returns,
    Raises,
}

pub const FUNCTION_LIKES: [u32; 7] = [k::FUNCTION_DECLARATION, k::METHOD_DECLARATION, k::CONSTRUCTOR, k::GET_ACCESSOR, k::SET_ACCESSOR, k::FUNCTION_EXPRESSION, k::ARROW_FUNCTION];

const SIGNATURES: [u32; 7] = [k::METHOD_SIGNATURE, k::CALL_SIGNATURE, k::JS_DOC_SIGNATURE, k::CONSTRUCT_SIGNATURE, k::INDEX_SIGNATURE, k::FUNCTION_TYPE, k::CONSTRUCTOR_TYPE];

const OUTER: [u32; 7] = [
    k::PARENTHESIZED_EXPRESSION,
    k::TYPE_ASSERTION_EXPRESSION,
    k::AS_EXPRESSION,
    k::SATISFIES_EXPRESSION,
    k::NON_NULL_EXPRESSION,
    k::PARTIALLY_EMITTED_EXPRESSION,
    k::EXPRESSION_WITH_TYPE_ARGUMENTS,
];

pub fn skip_outer(table: &NodeTable, mut index: u32) -> u32 {
    while OUTER.contains(&table.kind(index)) {
        let Some(inner) = table.child(index, "expression") else { break };
        index = inner;
    }
    index
}

pub struct Walker<'t> {
    types: &'t mut Types,
    table: Rc<NodeTable>,
    path: String,
}

pub fn is_catching(types: &mut Types, handle: &str) -> bool {
    let key = format!("catching:{handle}");
    if let Some(known) = types.kept.get(&key) {
        return *known;
    }
    let Some((index, _, path)) = parse_handle(handle) else { return false };
    let Some(table) = types.table_of(path) else { return false };
    let found = Walker { types, table, path: path.to_string() }.is_catching_function(index);
    if types.refused.is_none() {
        types.kept.insert(key, found);
    }
    found
}

impl Walker<'_> {
    fn thenable(&mut self, index: u32) -> bool {
        let handle = self.table.handle(index, &self.path);
        self.types.is_thenable_at(&handle)
    }

    fn is_boundary(&self, index: u32) -> bool {
        let kind = self.table.kind(index);
        FUNCTION_LIKES.contains(&kind) || SIGNATURES.contains(&kind) || kind == k::CLASS_DECLARATION || kind == k::CLASS_EXPRESSION
    }

    fn returns_promise(&mut self, index: u32) -> bool {
        if self.table.kind(index) != k::RETURN_STATEMENT {
            return false;
        }
        let Some(expression) = self.table.child(index, "expression") else { return false };
        self.table.kind(skip_outer(&self.table, expression)) != k::AWAIT_EXPRESSION && self.thenable(expression)
    }

    fn drops_promise(&mut self, index: u32) -> bool {
        if self.table.kind(index) != k::EXPRESSION_STATEMENT {
            return false;
        }
        self.table.child(index, "expression").is_some_and(|expression| self.thenable(expression))
    }

    fn raises(&mut self, index: u32) -> bool {
        let kind = self.table.kind(index);
        kind == k::THROW_STATEMENT
            || kind == k::AWAIT_EXPRESSION
            || (kind == k::VARIABLE_DECLARATION_LIST && self.table.flags(index) & node_flags::AWAIT_USING == node_flags::AWAIT_USING)
            || (kind == k::FOR_OF_STATEMENT && self.table.child(index, "awaitModifier").is_some())
            || self.returns_promise(index)
            || self.drops_promise(index)
    }

    fn matches(&mut self, index: u32, probe: Probe) -> bool {
        match probe {
            Probe::Returns => self.returns_promise(index),
            Probe::Raises => self.raises(index),
        }
    }

    fn guarded_parts(&self, statement: u32) -> Vec<u32> {
        let catch = self.table.child(statement, "catchClause").and_then(|clause| self.table.child(clause, "block"));
        [catch, self.table.child(statement, "finallyBlock")].into_iter().flatten().collect()
    }

    fn any_inside(&mut self, root: u32, probe: Probe, guards: bool) -> bool {
        let mut pending = vec![root];
        let mut at = 0;
        while at < pending.len() {
            let node = pending[at];
            at += 1;
            if self.matches(node, probe) {
                return true;
            }
            if guards && self.table.kind(node) == k::TRY_STATEMENT && self.table.child(node, "catchClause").is_some() {
                pending.extend(self.guarded_parts(node));
            } else if node == root || !self.is_boundary(node) {
                pending.extend(self.table.children(node));
            }
        }
        false
    }

    fn is_catching_statement(&mut self, statement: u32) -> bool {
        if self.table.kind(statement) != k::TRY_STATEMENT || self.table.child(statement, "catchClause").is_none() {
            return false;
        }
        let Some(block) = self.table.child(statement, "tryBlock") else { return false };
        if self.any_inside(block, Probe::Returns, false) {
            return false;
        }
        !self.guarded_parts(statement).into_iter().any(|part| self.any_inside(part, Probe::Raises, true))
    }

    fn is_catching_function(&mut self, index: u32) -> bool {
        if !self.table.has_modifier(index, k::ASYNC_KEYWORD) {
            return false;
        }
        let Some(body) = self.table.child(index, "body").filter(|body| self.table.kind(*body) == k::BLOCK) else { return false };
        let statements = self.table.listed(body, "statements");
        !statements.is_empty() && statements.into_iter().all(|statement| self.is_catching_statement(statement))
    }
}
