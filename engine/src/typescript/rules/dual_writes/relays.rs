//! `isRelayPublish`: a publish that is the relay of a row read from the database, in a loop over the rows or
//! for a single row, when the same row is written again after the publish.
use super::no_dual_write::Check;
use super::sites::Site;
use crate::typescript::rules::collections::loops::{Site as Loop, enclosing_loop};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::effects::tags::has;
use oxc_semantic::SymbolId;

struct Element<'v> {
    variables: Vec<SymbolId>,
    iterable: Node<'v>,
    scope: Node<'v>,
}

/// The identifiers a binding pattern declares.
fn pattern_names<'v>(pattern: Node<'v>, found: &mut Vec<Node<'v>>) {
    match pattern.kind() {
        "Identifier" => found.push(pattern),
        "ObjectPattern" => {
            for property in pattern.nodes("properties") {
                if let Some(inner) = if property.is("Property") { property.node("value") } else { property.node("argument") } {
                    pattern_names(inner, found);
                }
            }
        }
        "ArrayPattern" => pattern.nodes("elements").into_iter().for_each(|element| pattern_names(element, found)),
        "AssignmentPattern" => pattern.node("left").into_iter().for_each(|left| pattern_names(left, found)),
        "RestElement" => pattern.node("argument").into_iter().for_each(|inner| pattern_names(inner, found)),
        "TSParameterProperty" => pattern.node("parameter").into_iter().for_each(|inner| pattern_names(inner, found)),
        _ => {}
    }
}

fn awaited(node: Option<Node>) -> Option<Node> {
    node.map(|node| if node.is("AwaitExpression") { node.node("argument") } else { Some(node) }).unwrap_or(None)
}

impl<'a, 'v> Check<'a, 'v> {
    fn variables_of(&self, patterns: impl Iterator<Item = Node<'v>>) -> Vec<SymbolId> {
        let mut identifiers = Vec::new();
        patterns.for_each(|pattern| pattern_names(pattern, &mut identifiers));
        identifiers.into_iter().filter_map(|identifier| self.scopes.variable_named(identifier)).collect()
    }

    fn loop_element(&self, found: Option<Loop<'v>>) -> Option<Element<'v>> {
        match found? {
            Loop::Loop(lp) if lp.is("ForOfStatement") => {
                let declarators = lp.node("left").filter(|left| left.is("VariableDeclaration")).map(|left| left.nodes("declarations")).unwrap_or_default();
                let variables = self.variables_of(declarators.into_iter().filter_map(|declarator| declarator.node("id")));
                Some(Element { variables, iterable: lp.node("right")?, scope: lp })
            }
            Loop::Loop(_) => None,
            Loop::Callback(callback) => {
                let call = callback.parent()?;
                let callee = (call.is("CallExpression") || call.is("NewExpression")).then(|| call.node("callee")).flatten()?;
                if !callee.is("MemberExpression") {
                    return None;
                }
                let variables = self.variables_of(callback.nodes("params").into_iter().take(1));
                Some(Element { variables, iterable: callee.node("object")?, scope: callback })
            }
        }
    }

    fn init_of(&self, variable: SymbolId) -> Option<Node<'v>> {
        let definition = self.scopes.defs(variable).into_iter().next()?;
        if definition.kind == DefKind::Variable { definition.node.node("init") } else { None }
    }

    fn source_call(&self, iterable: Option<Node<'v>>) -> Option<Node<'v>> {
        let value = awaited(iterable)?;
        if !value.is("Identifier") {
            return Some(value);
        }
        let variable = self.scopes.variable_by_name(&value.name()?, value.start())?;
        awaited(self.init_of(variable))
    }

    /// `isDatabaseRead`; `None` when the compiler refused.
    fn is_database_read(&mut self, iterable: Option<Node<'v>>) -> Option<bool> {
        let Some(call) = self.source_call(iterable).filter(|call| call.is("CallExpression")) else { return Some(false) };
        let effects = self.effects_of(call)?;
        Some(has(&effects, "database") && !has(&effects, "write"))
    }

    fn references(&self, variables: &[SymbolId], call: Node) -> bool {
        variables.iter().any(|variable| self.scopes.references(*variable).iter().any(|reference| call.contains(reference.identifier)))
    }

    fn read_rows(&mut self, call: Node<'v>) -> Option<Vec<SymbolId>> {
        let mut pending: Vec<Node<'v>> = if call.is("CallExpression") { call.nodes("arguments") } else { Vec::new() };
        let mut at = 0;
        while at < pending.len() {
            let children = pending[at].children();
            pending.extend(children);
            at += 1;
        }
        let mut variables: Vec<SymbolId> = Vec::new();
        for identifier in pending.into_iter().filter(|node| node.is("Identifier")) {
            let found = identifier.name().and_then(|name| self.scopes.variable_by_name(&name, identifier.start()));
            if let Some(variable) = found.filter(|variable| !variables.contains(variable)) {
                variables.push(variable);
            }
        }
        let mut rows = Vec::new();
        for variable in variables {
            if self.is_database_read(self.init_of(variable))? {
                rows.push(variable);
            }
        }
        Some(rows)
    }

    fn is_marked_after(&self, variables: &[SymbolId], scope: Node, publish: Node, writes: &[Site]) -> bool {
        writes.iter().any(|write| write.call.start() >= publish.end() && scope.contains(write.call) && self.references(variables, write.call))
    }

    /// `isRelayPublish`; `None` when the compiler refused.
    pub fn is_relay_publish(&mut self, publish: &Site<'v>, writes: &[Site<'v>]) -> Option<bool> {
        let found = enclosing_loop(publish.call, self.types)?;
        let element = self.loop_element(found);
        if let Some(element) = element {
            if self.references(&element.variables, publish.call) && self.is_database_read(Some(element.iterable))? {
                return Some(self.is_marked_after(&element.variables, element.scope, publish.call, writes));
            }
        }
        let rows = self.read_rows(publish.call)?;
        Some(!rows.is_empty() && self.is_marked_after(&rows, self.program, publish.call, writes))
    }
}
