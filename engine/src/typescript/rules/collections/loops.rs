//! `enclosingLoop`: the loop, or the iteration callback, whose every pass a node runs in.
use crate::typescript::rules::signatures::is_function;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const LOOPS: [&str; 5] = ["ForOfStatement", "ForInStatement", "ForStatement", "WhileStatement", "DoWhileStatement"];
const ITERATION_METHODS: [&str; 14] = [
    "map", "forEach", "flatMap", "filter", "reduce", "some", "every", "find", "findIndex", "reduceRight", "findLast", "findLastIndex", "sort",
    "toSorted",
];

fn is_loop_body(parent: Node, child: Node) -> bool {
    ["body", "test", "update"].iter().any(|key| parent.node(key) == Some(child))
}

fn is_iteration_callback(types: &RefCell<Types>, function: Node) -> Option<bool> {
    let Some(call) = function.parent().filter(|call| call.is("CallExpression")) else { return Some(false) };
    let arguments = call.nodes("arguments");
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    let (Some(callee), true) = (callee, arguments.contains(&function)) else { return Some(false) };
    let (Some(object), Some(property)) = (callee.node("object"), callee.node("property")) else { return Some(false) };
    let method = property.name();
    let maps_from = method.as_deref() == Some("from")
        && object.name().is_some_and(|name| name == "Array")
        && arguments.get(1) == Some(&function);
    if maps_from {
        return Some(true);
    }
    if !method.is_some_and(|method| ITERATION_METHODS.contains(&method.as_ref())) {
        return Some(false);
    }
    types.borrow_mut().holds_collection(object.start(), object.end())
}

pub enum Site<'v> {
    Loop(Node<'v>),
    Callback(Node<'v>),
}

impl<'v> Site<'v> {
    pub fn node(&self) -> Node<'v> {
        match self {
            Site::Loop(node) | Site::Callback(node) => *node,
        }
    }
}

pub fn enclosing_loop<'v>(node: Node<'v>, types: &RefCell<Types>) -> Option<Option<Site<'v>>> {
    let mut child = node;
    for parent in node.ancestors() {
        if LOOPS.contains(&parent.kind()) && is_loop_body(parent, child) {
            return Some(Some(Site::Loop(parent)));
        }
        if is_function(parent) {
            return is_iteration_callback(types, parent).map(|holds| holds.then_some(Site::Callback(parent)));
        }
        child = parent;
    }
    Some(None)
}
