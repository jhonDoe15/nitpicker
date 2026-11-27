//! `result-uses.mts`: the one place a query result is used, and whether that use counts, filters, sorts or
//! aggregates the rows by their fields in memory.
use super::filter_tests::is_column_comparison;
use super::rows::{ReadOptions, reads_only_fields};
use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::{is_function_node, unwrapped};
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::time_zones::bindings::library_binding;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Shape {
    Count,
    Filter,
    Sort,
    Aggregate,
}

pub struct Use<'s> {
    pub node: Node<'s>,
    pub shape: Shape,
}

const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const FILTER_METHODS: [&str; 6] = ["filter", "some", "every", "find", "findIndex", "findLast"];
const SORT_METHODS: [&str; 2] = ["sort", "toSorted"];
const REDUCE_METHODS: [&str; 2] = ["reduce", "reduceRight"];
const LODASH: [&str; 2] = ["lodash", "lodash-es"];
const LOOPS: [&str; 5] = ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"];
const ONE_ROW: ReadOptions = ReadOptions { rows: 1, accumulator: false };

fn lodash_shape_of(name: &str) -> Option<Shape> {
    Some(match name {
        "sumBy" | "maxBy" | "minBy" | "meanBy" | "groupBy" | "countBy" => Shape::Aggregate,
        "sortBy" | "orderBy" => Shape::Sort,
        "filter" | "find" | "some" | "every" => Shape::Filter,
        "size" | "isEmpty" => Shape::Count,
        _ => return None,
    })
}

/// `outerOf`: the node with the type assertions and optional chain around it.
pub fn outer_of(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| TYPE_WRAPPERS.contains(&parent.kind()) && parent.node("expression") == Some(current)) {
        current = parent;
    }
    current
}

fn home_of(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| is_function_node(*ancestor) || ancestor.is("Program"))
}

fn crosses_repeat(read: Node, home: Option<Node>) -> bool {
    let path: Vec<Node> = read.ancestors().collect();
    let end = match path.iter().position(|ancestor| Some(*ancestor) == home) {
        Some(index) => index,
        None => path.len().saturating_sub(1),
    };
    let inside = &path[..end];
    inside.iter().enumerate().any(|(index, ancestor)| {
        let child = if index == 0 { read } else { inside[index - 1] };
        let loop_right = ancestor.is("ForOfStatement") && ancestor.node("right") == Some(child);
        is_function_node(*ancestor) || (LOOPS.contains(&ancestor.kind()) && !loop_right)
    })
}

/// The `typeof name` type queries of the variable, which ESLint's scope manager counts as reads.
fn type_queries<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, variable: oxc_semantic::SymbolId) -> Vec<Node<'s>> {
    let program = node.ancestors().last().unwrap_or(node);
    let mut found = Vec::new();
    for query in program.descendants().into_iter().filter(|query| query.is("TSTypeQuery")) {
        let mut root = query.node("exprName");
        while let Some(qualified) = root.filter(|name| name.is("TSQualifiedName")) {
            root = qualified.node("left");
        }
        let Some(identifier) = root.filter(|name| name.is("Identifier")) else { continue };
        let resolved = scopes.variable_named(identifier).or_else(|| identifier.name().and_then(|name| scopes.variable_by_name(&name, identifier.start())));
        if resolved == Some(variable) {
            found.push(identifier);
        }
    }
    found
}

/// `resultSite`: the expression itself, or the one read of the variable it initialises.
pub fn result_site<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    let outer = outer_of(node);
    let Some(declarator) = outer.parent().filter(|declarator| declarator.is("VariableDeclarator") && declarator.node("init") == Some(outer)) else { return Some(outer) };
    let id = declarator.node("id").filter(|id| id.is("Identifier"))?;
    let variable = scopes.variable_named(id)?;
    let references = scopes.references(variable);
    let mut reads: Vec<Node> = references.iter().filter(|reference| reference.read).map(|reference| reference.identifier).collect();
    for queried in type_queries(scopes, outer, variable) {
        if !reads.contains(&queried) {
            reads.push(queried);
        }
    }
    let writes = references.iter().filter(|reference| reference.write).count();
    let [read] = reads.as_slice() else { return None };
    (writes == 1 && !crosses_repeat(*read, home_of(declarator))).then_some(*read)
}

fn is_length_read(member: Node) -> bool {
    let Some(parent) = member.parent() else { return false };
    let assigned = parent.is("AssignmentExpression") && parent.node("left") == Some(member);
    member_name(member).as_deref() == Some("length") && !assigned && !parent.is("UpdateExpression")
}

fn extreme_of_map<'s>(call: Node<'s>) -> Option<Node<'s>> {
    let spread = outer_of(call).parent().filter(|spread| spread.is("SpreadElement"))?;
    let outer = spread.parent().filter(|outer| outer.is("CallExpression"))?;
    let callee = outer.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"))?;
    let object = callee.node("object").map(unwrapped).filter(|object| object.is("Identifier"))?;
    let extreme = matches!(member_name(callee).as_deref(), Some("max" | "min"));
    let is_math = object.name().as_deref() == Some("Math") && extreme;
    (is_math && reads_only_fields(call.nodes("arguments").first().copied(), ONE_ROW)).then_some(outer)
}

fn method_shape<'s>(scopes: &Scopes<'_, 's>, member: Node<'s>) -> Option<Use<'s>> {
    let outer = outer_of(member);
    let call = outer.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(outer))?;
    let method = member_name(member);
    let method = method.as_deref().unwrap_or_default();
    let callback = call.nodes("arguments").first().copied();
    let object = member.node("object")?;
    if FILTER_METHODS.contains(&method) && is_column_comparison(scopes, callback, object) && reads_only_fields(callback, ONE_ROW) {
        return Some(Use { node: call, shape: Shape::Filter });
    }
    if SORT_METHODS.contains(&method) && reads_only_fields(callback, ReadOptions { rows: 2, accumulator: false }) {
        return Some(Use { node: call, shape: Shape::Sort });
    }
    if REDUCE_METHODS.contains(&method) && reads_only_fields(callback, ReadOptions { rows: 1, accumulator: true }) {
        return Some(Use { node: call, shape: Shape::Aggregate });
    }
    let extreme = if method == "map" && member_name(member).is_some() { extreme_of_map(call) } else { None };
    extreme.map(|node| Use { node, shape: Shape::Aggregate })
}

fn member_shape<'s>(scopes: &Scopes<'_, 's>, member: Node<'s>) -> Option<Use<'s>> {
    if is_length_read(member) {
        return Some(Use { node: member, shape: Shape::Count });
    }
    method_shape(scopes, member)
}

fn is_iteratee(node: Option<Node>) -> bool {
    let Some(target) = node.map(unwrapped) else { return false };
    if string_value(Some(target)).is_some() {
        return true;
    }
    if target.is("ArrayExpression") {
        let elements = target.list("elements");
        return !elements.is_empty() && elements.iter().all(|element| string_value(*element).is_some());
    }
    reads_only_fields(Some(target), ONE_ROW)
}

fn lodash_name<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>) -> Option<String> {
    let target = unwrapped(callee);
    let member = target.is("MemberExpression");
    let identifier = if member { unwrapped(target.node("object")?) } else { target };
    if !identifier.is("Identifier") {
        return None;
    }
    let binding = library_binding(scopes, identifier, &LODASH)?;
    if member { member_name(target) } else { binding.name }
}

fn lodash_shape<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Use<'s>> {
    let shape = lodash_shape_of(&lodash_name(scopes, call.node("callee")?)?)?;
    let arguments = call.nodes("arguments");
    let counted = if shape == Shape::Count { arguments.len() == 1 } else { is_iteratee(arguments.get(1).copied()) };
    counted.then_some(Use { node: call, shape })
}

fn argument_shape<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Use<'s>> {
    let member = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
    let owner = member.and_then(|member| member.node("object")).map(unwrapped);
    let owned = owner.is_some_and(|owner| owner.is("Identifier") && matches!(owner.name().as_deref(), Some("Object" | "Map")));
    let grouping = owned && member.and_then(member_name).as_deref() == Some("groupBy");
    if grouping {
        return reads_only_fields(call.nodes("arguments").get(1).copied(), ONE_ROW).then_some(Use { node: call, shape: Shape::Aggregate });
    }
    lodash_shape(scopes, call)
}

/// `useOf`.
pub fn use_of<'s>(scopes: &Scopes<'_, 's>, site: Node<'s>) -> Option<Use<'s>> {
    let outer = outer_of(site);
    let parent = outer.parent()?;
    if parent.is("MemberExpression") && parent.node("object") == Some(outer) && !parent.flag("computed") {
        return member_shape(scopes, parent);
    }
    if parent.is("CallExpression") && parent.nodes("arguments").first() == Some(&outer) {
        return argument_shape(scopes, parent);
    }
    None
}
