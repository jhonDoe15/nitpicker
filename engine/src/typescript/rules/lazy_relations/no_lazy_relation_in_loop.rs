//! `no-lazy-relation-in-loop`: a lazy TypeORM relation awaited for each item a query loaded, directly
//! (`await order.customer`, `order.customer.then(...)`, a destructured relation) or through a helper the loop
//! passes each item to, when the query does not fetch the relation.
use super::queries::{QueryOrigin, is_fetched, origin_query};
use super::relations::{helper_relation, lazy_binding, lazy_relation};
use super::schema::{Relation, Schemas};
use crate::typescript::rules::Context;
use crate::typescript::rules::collections::loops::{Site, enclosing_loop};
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "no-lazy-relation-in-loop";
const LAZY: &str = "`{{entity}}.{{relation}}` is a lazy relation: awaiting it for each item loaded by `{{origin}}` runs one more query per item. Fetch it in that query: name it in `relations` (`relations: { {{relation}}: true }`) or join it with `leftJoinAndSelect`. An exception fits only when the loop reads it for a few items at most.";
const LAZY_HELPER: &str = "`{{helper}}` receives each item loaded by `{{origin}}` and awaits `{{access}}`, the lazy relation `{{entity}}.{{relation}}`: one more query per item. Fetch it in that query: name it in `relations` (`relations: { {{relation}}: true }`) or join it with `leftJoinAndSelect`. An exception fits only when the loop passes a few items at most.";
const THEN_STEPS: [&str; 3] = ["then", "catch", "finally"];
const ITERATION_METHODS: [&str; 14] = [
    "map", "forEach", "flatMap", "filter", "reduce", "some", "every", "find", "findIndex", "reduceRight", "findLast", "findLastIndex", "sort",
    "toSorted",
];

#[derive(Clone, Copy)]
struct LoopItem<'v> {
    declared: Option<Node<'v>>,
    iterable: Node<'v>,
    lp: Node<'v>,
}

struct Check<'c, 'a, 'v> {
    types: &'c RefCell<Types>,
    schemas: Schemas,
    scopes: &'c Scopes<'a, 'v>,
    source: &'c str,
    found: Vec<(u32, u32, String)>,
}

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn plain_member(node: Option<Node>) -> Option<Node> {
    node.filter(|node| node.is("MemberExpression") && !node.flag("computed"))
}

fn loop_item(site: Site) -> Option<LoopItem> {
    match site {
        Site::Loop(lp) if lp.is("ForOfStatement") => {
            let left = lp.node("left")?;
            let declared = if left.is("VariableDeclaration") { left.nodes("declarations").first().and_then(|declarator| declarator.node("id")) } else { Some(left) };
            Some(LoopItem { declared, iterable: lp.node("right")?, lp })
        }
        Site::Loop(_) => None,
        Site::Callback(callback) => {
            let call = callback.parent().filter(|call| call.is("CallExpression"))?;
            let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
            Some(LoopItem { declared: callback.list("params").first().copied().flatten(), iterable: callee.node("object")?, lp: callback })
        }
    }
}

fn is_iteration_call(call: Node) -> bool {
    name_of(plain_member(call.node("callee")).and_then(|callee| callee.node("property"))).is_some_and(|method| ITERATION_METHODS.contains(&method.as_str()))
}

impl<'v> Check<'_, '_, 'v> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    fn binding(&self, identifier: Node<'v>) -> Option<Node<'v>> {
        let variable = self.scopes.variable_by_name(&identifier.name()?, identifier.start())?;
        self.scopes.defs(variable).into_iter().next().map(|definition| definition.name)
    }

    fn iterated_item(&self, identifier: Node<'v>) -> Option<LoopItem<'v>> {
        if !identifier.is("Identifier") {
            return None;
        }
        let item = enclosing_loop(identifier, self.types).flatten().and_then(loop_item);
        let binding = self.binding(identifier);
        item.filter(|item| binding == item.declared)
    }

    fn passed_item(&self, call: Node<'v>) -> Option<(LoopItem<'v>, Node<'v>, usize)> {
        let arguments = call.list("arguments");
        let reference = arguments.first().copied().flatten().filter(|reference| reference.is("Identifier") || reference.is("MemberExpression"));
        let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
        if let (true, Some(callee), Some(reference)) = (is_iteration_call(call), callee, reference) {
            return Some((LoopItem { declared: None, iterable: callee.node("object")?, lp: call }, reference, 0));
        }
        let items: Vec<Option<LoopItem>> = arguments.into_iter().map(|argument| argument.and_then(|argument| self.iterated_item(argument))).collect();
        let index = items.iter().position(Option::is_some)?;
        Some((items[index]?, call.node("callee")?, index))
    }

    fn origin(&self, item: LoopItem<'v>) -> Option<QueryOrigin<'v>> {
        origin_query(&mut self.types.borrow_mut(), self.scopes, item.iterable, item.lp)
    }

    fn destructured_relation(&mut self, identifier: Node<'v>) -> Option<(LoopItem<'v>, Relation)> {
        let variable = self.scopes.variable_by_name(&identifier.name()?, identifier.start())?;
        let definition = self.scopes.defs(variable).into_iter().next()?;
        let declarator = definition.node;
        let pattern = declarator.node("id").filter(|pattern| declarator.is("VariableDeclarator") && pattern.is("ObjectPattern"))?;
        let source = declarator.node("init")?;
        let property = pattern.nodes("properties").into_iter().find(|each| each.is("Property") && !each.flag("computed") && each.node("value") == Some(definition.name));
        let name = name_of(property.and_then(|property| property.node("key")))?;
        let item = self.iterated_item(source)?;
        let relation = lazy_binding(&mut self.types.borrow_mut(), &mut self.schemas, source, &name)?;
        Some((item, relation))
    }

    fn accessed_relation(&mut self, member: Node<'v>) -> Option<(LoopItem<'v>, Relation)> {
        let item = plain_member(Some(member)).and_then(|member| member.node("object")).and_then(|object| self.iterated_item(object));
        if let Some(item) = item {
            if let Some(relation) = lazy_relation(&mut self.types.borrow_mut(), &mut self.schemas, member) {
                return Some((item, relation));
            }
        }
        if member.is("Identifier") { self.destructured_relation(member) } else { None }
    }

    fn relation_finding(&mut self, member: Node<'v>) -> Option<String> {
        let (item, relation) = self.accessed_relation(member)?;
        let origin = self.origin(item)?;
        let unfetched = !is_fetched(&origin, &relation.relation);
        unfetched.then(|| interpolate(LAZY, &[("entity", &relation.entity), ("relation", &relation.relation), ("origin", &origin.label)]))
    }

    fn helper_finding(&mut self, call: Node<'v>) -> Option<String> {
        let (item, reference, index) = self.passed_item(call)?;
        let origin = self.origin(item)?;
        let found = helper_relation(&mut self.types.borrow_mut(), &mut self.schemas, reference, index)?;
        let helper = &self.source[reference.start() as usize..reference.end() as usize];
        let data = [("helper", helper), ("origin", &origin.label), ("access", &found.access), ("entity", &found.relation.entity), ("relation", &found.relation.relation)];
        (!is_fetched(&origin, &found.relation.relation)).then(|| interpolate(LAZY_HELPER, &data))
    }

    fn report(&mut self, node: Node, message: Option<String>) {
        if let Some(message) = message.filter(|_| !self.refused()) {
            self.found.push((node.start(), node.end(), message));
        }
    }

    fn check_call(&mut self, call: Node<'v>) {
        let message = self.helper_finding(call);
        self.report(call, message);
        let callee = plain_member(call.node("callee"));
        let thened = callee.filter(|callee| name_of(callee.node("property")).is_some_and(|name| THEN_STEPS.contains(&name.as_str())));
        let Some(access) = thened.and_then(|callee| callee.node("object")) else { return };
        let message = self.relation_finding(access);
        if access.is("MemberExpression") {
            self.report(call, message);
        }
    }
}

pub fn no_lazy_relation_in_loop(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let schemas: Schemas = {
        let mut borrowed = types.borrow_mut();
        if borrowed.refused.is_some() {
            return;
        }
        borrowed.take_store()
    };
    let mut check = Check { types, schemas, scopes, source: context.file.text, found: Vec::new() };
    for node in view.nodes() {
        if check.refused() {
            break;
        }
        if node.is("CallExpression") {
            check.check_call(node);
        } else if node.is("AwaitExpression") {
            let message = node.node("argument").and_then(|argument| check.relation_finding(argument));
            check.report(node, message);
        }
    }
    let refused = check.refused();
    let Check { schemas, found, .. } = check;
    types.borrow_mut().put_store(schemas);
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
