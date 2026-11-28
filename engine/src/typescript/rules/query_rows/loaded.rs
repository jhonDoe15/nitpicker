//! `loadedRows`, `singleRead`, `resultBinding` and `isProjection`: where the rows an awaited query loads are read,
//! and whether the query picks its columns.
use super::calls::call_chain;
use crate::typescript::rules::held_scopes::estree_calls::is_function;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::syntax::{name_of, static_key, unwrapped};
use oxc_semantic::SymbolId;

const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const PROJECTIONS: [&str; 4] = ["select", "columns", "attributes", "fields"];
const DRIZZLE_SELECTS: [&str; 2] = ["select", "selectDistinct"];

pub struct LoadedRows<'v> {
    pub reads: Vec<Node<'v>>,
    pub home: Option<Node<'v>>,
}

/// `outerOf`: the node with the type assertions and optional chains around it.
pub fn outer_of(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| TYPE_WRAPPERS.contains(&parent.kind()) && parent.node("expression") == Some(current)) {
        current = parent;
    }
    current
}

/// `homeOf`: the function or program the node is in.
pub fn home_of(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| is_function(*ancestor) || ancestor.is("Program"))
}

pub struct ResultBinding<'v> {
    pub outer: Node<'v>,
    pub declarator: Option<Node<'v>>,
    pub variable: Option<SymbolId>,
}

/// `resultBinding`: the declarator the value initializes, and the variable it declares when its name is plain.
pub fn result_binding<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> ResultBinding<'v> {
    let outer = outer_of(node);
    let declarator = outer.parent().filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(outer));
    let variable = declarator.and_then(|declarator| declarator.node("id")).filter(|id| id.is("Identifier")).and_then(|id| scopes.variable_named(id));
    ResultBinding { outer, declarator, variable }
}

fn is_guard_read(read: Node) -> bool {
    let outer = outer_of(read);
    let Some(member) = outer.parent() else { return false };
    let is_length = member.is("MemberExpression")
        && member.node("object") == Some(outer)
        && !member.flag("computed")
        && name_of(member.node("property")).as_deref() == Some("length");
    let tested = std::iter::once(member).chain(member.ancestors()).any(|node| {
        node.parent().is_some_and(|parent| parent.is("IfStatement") && parent.node("test") == Some(node))
    });
    is_length && tested
}

pub fn loaded_rows<'v>(scopes: &Scopes<'_, 'v>, awaited: Node<'v>) -> Option<LoadedRows<'v>> {
    let outer = outer_of(awaited);
    let Some(declarator) = outer.parent().filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(outer)) else {
        return Some(LoadedRows { reads: vec![outer], home: home_of(outer) });
    };
    let id = declarator.node("id").filter(|id| id.is("Identifier"))?;
    let references = scopes.variable_named(id).map(|variable| scopes.references_with_types(variable)).unwrap_or_default();
    let writes = references.iter().filter(|reference| reference.write).count();
    let reads = references.iter().filter(|reference| reference.read || reference.as_type).map(|reference| reference.identifier).filter(|read| !is_guard_read(*read));
    (writes == 1).then(|| LoadedRows { reads: reads.collect(), home: home_of(declarator) })
}

/// `singleRead`: the one place the value is read, when it is read once.
pub fn single_read<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> Option<Node<'v>> {
    let binding = result_binding(scopes, node);
    if binding.declarator.is_none() {
        return Some(binding.outer);
    }
    let references = binding.variable.map(|variable| scopes.references_with_types(variable)).unwrap_or_default();
    let reads: Vec<Node> = references.iter().filter(|reference| reference.read || reference.as_type).map(|reference| reference.identifier).collect();
    (reads.len() == 1 && references.len() == 2).then(|| reads[0])
}

fn has_projection_key(argument: Node) -> bool {
    let target = unwrapped(argument);
    target.is("ObjectExpression") && target.nodes("properties").into_iter().any(|property| static_key(property).is_some_and(|key| PROJECTIONS.contains(&key.as_str())))
}

pub fn is_projection(query: Node) -> bool {
    let drizzle = call_chain(query).into_iter().any(|call| {
        let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
        let selects = callee.and_then(|callee| name_of(callee.node("property"))).is_some_and(|name| DRIZZLE_SELECTS.contains(&name.as_str()));
        selects && !call.nodes("arguments").is_empty()
    });
    drizzle || query.nodes("arguments").into_iter().any(has_projection_key)
}
