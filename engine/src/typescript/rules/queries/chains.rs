//! `query-chains.mts`: the steps of a query builder chain, followed through the local variable that holds the
//! builder, and the library that chain builds with.
use super::libraries::{Library, QueryScope, chain_library};
use crate::typescript::rules::security_values::leaves::{assigned_writes, declared_writes};
use crate::typescript::rules::security_values::{member_name, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Reference, Scopes};
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;

const ORDER_STEPS: [&str; 3] = ["orderBy", "addOrderBy", "orderByRaw"];
const OPAQUE_STEPS: [&str; 7] = ["$call", "$if", "modify", "$dynamic", "call", "apply", "pipe"];
const WRITE_STEPS: [&str; 13] =
    ["insert", "insertInto", "update", "updateTable", "delete", "deleteFrom", "del", "softDelete", "restore", "replaceInto", "mergeInto", "truncate", "relation"];

#[derive(Clone)]
pub struct Step<'s> {
    pub name: Option<String>,
    pub call: Node<'s>,
    pub object: Node<'s>,
}

pub struct ChainShape<'s> {
    pub root: Node<'s>,
    pub steps: Vec<Step<'s>>,
}

pub struct QueryChain<'s> {
    pub library: Library,
    pub steps: Vec<Step<'s>>,
    pub names: Vec<Option<String>>,
}

struct Expanded<'s> {
    root: Node<'s>,
    steps: Vec<Step<'s>>,
    related: Vec<Step<'s>>,
}

fn step_of(node: Node) -> Option<Step> {
    let call = unwrapped(node);
    let callee = call.node("callee").map(unwrapped).filter(|callee| call.is("CallExpression") && callee.is("MemberExpression"))?;
    let object = unwrapped(callee.node("object")?);
    Some(Step { name: member_name(callee), call, object })
}

/// `chainSteps`: the calls of a member chain from its root out to `node`, and the root.
pub fn chain_steps(node: Node) -> ChainShape {
    let mut steps = Vec::new();
    let mut current = unwrapped(node);
    while let Some(step) = step_of(current) {
        current = step.object;
        steps.insert(0, step);
    }
    ChainShape { root: current, steps }
}

/// `isOutermostStep`: the call is not the object of a further call on it.
pub fn is_outermost_step(node: Node) -> bool {
    let Some(member) = node.parent().filter(|parent| parent.is("MemberExpression") && parent.node("object") == Some(node)) else { return true };
    !member.parent().is_some_and(|call| call.is("CallExpression") && call.node("callee") == Some(member))
}

/// `assignedTarget`: the variable or target a declarator or assignment gives `node` to.
pub fn assigned_target(node: Node) -> Option<Node> {
    let holder = node.parent()?;
    if holder.is("VariableDeclarator") && holder.node("init") == Some(node) {
        return holder.node("id");
    }
    if holder.is("AssignmentExpression") && holder.node("right") == Some(node) { holder.node("left") } else { None }
}

fn builder_variable(scopes: &Scopes, identifier: Node) -> Option<SymbolId> {
    let name = identifier.name().filter(|_| identifier.is("Identifier"))?;
    let variable = scopes.variable_by_name(&name, identifier.start())?;
    let definitions = scopes.defs(variable);
    let [definition] = definitions.as_slice() else { return None };
    (definition.kind == DefKind::Variable && definition.node.node("init").is_some()).then_some(variable)
}

fn written_chains<'s>(scopes: &Scopes<'_, 's>, variable: SymbolId, reference: &Reference<'s>) -> Option<Vec<ChainShape<'s>>> {
    let declared = scopes.defs(variable).iter().any(|definition| definition.name == reference.identifier);
    let written = if declared { declared_writes(reference.identifier) } else { assigned_writes(reference.identifier) };
    if written.is_empty() { None } else { Some(written.into_iter().map(chain_steps).collect()) }
}

fn read_chain(identifier: Node) -> Option<ChainShape> {
    let member = identifier.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(identifier))?;
    let Some(mut call) = member.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(member)) else {
        return Some(ChainShape { root: identifier, steps: Vec::new() });
    };
    while !is_outermost_step(call) {
        match call.parent().and_then(|member| member.parent()).filter(|next| next.is("CallExpression")) {
            Some(next) => call = next,
            None => break,
        }
    }
    Some(chain_steps(call))
}

fn variable_chains<'s>(scopes: &Scopes<'_, 's>, variable: SymbolId) -> Option<Vec<ChainShape<'s>>> {
    let mut chains = Vec::new();
    for reference in scopes.references(variable) {
        if reference.write {
            chains.extend(written_chains(scopes, variable, &reference)?);
        } else {
            chains.push(read_chain(reference.identifier)?);
        }
    }
    Some(chains)
}

fn expanded_chain<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Expanded<'s>> {
    let own = chain_steps(node);
    let variables: Vec<SymbolId> = [Some(own.root), assigned_target(node)].into_iter().flatten().filter_map(|identifier| builder_variable(scopes, identifier)).collect();
    let mut related = Vec::new();
    for variable in &variables {
        related.extend(variable_chains(scopes, *variable)?.into_iter().flat_map(|chain| chain.steps));
    }
    let Some(root_variable) = builder_variable(scopes, own.root) else { return Some(Expanded { root: own.root, steps: own.steps, related }) };
    let init = scopes.defs(root_variable).into_iter().next().and_then(|definition| definition.node.node("init"))?;
    let declared = chain_steps(init);
    if declared.steps.is_empty() {
        return None;
    }
    let mut steps = declared.steps;
    steps.extend(own.steps);
    Some(Expanded { root: declared.root, steps, related })
}

/// `queryChain`: the query chain that ends at `node`, or none when it is no query builder or escapes the file.
pub fn query_chain<'s>(scope: &QueryScope<'_, '_, 's>, node: Node<'s>) -> Option<QueryChain<'s>> {
    let chain = expanded_chain(scope.module.scopes, node)?;
    let names = step_names(chain.steps.iter().chain(&chain.related));
    let library = chain_library(scope, Some(chain.root), &names)?;
    Some(QueryChain { library, steps: chain.steps, names })
}

/// The distinct names of steps, in order.
pub fn step_names<'a, 's: 'a>(steps: impl Iterator<Item = &'a Step<'s>>) -> Vec<Option<String>> {
    let mut names: Vec<Option<String>> = Vec::new();
    for step in steps {
        let name = step.name.clone();
        if !names.contains(&name) {
            names.push(name);
        }
    }
    names
}

fn any_of(names: &[Option<String>], wanted: &[&str]) -> bool {
    names.iter().any(|name| name.as_deref().is_some_and(|name| wanted.contains(&name)))
}

pub fn is_ordered(names: &[Option<String>]) -> bool {
    any_of(names, &ORDER_STEPS)
}

pub fn is_opaque(names: &[Option<String>]) -> bool {
    any_of(names, &OPAQUE_STEPS)
}

pub fn is_write(names: &[Option<String>]) -> bool {
    any_of(names, &WRITE_STEPS)
}
