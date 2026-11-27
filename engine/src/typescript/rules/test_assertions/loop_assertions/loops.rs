//! `loops.mts`: the loops and iterating callbacks around an assertion that can run zero times.
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::{name, property_name};

pub struct Construct<'v> {
    pub node: Node<'v>,
    pub name: String,
    pub collection: Option<Node<'v>>,
}

const ITERATING_METHODS: &[&str] = &[
    "forEach", "map", "flatMap", "filter", "some", "every", "reduce", "reduceRight", "find", "findIndex", "findLast", "findLastIndex",
];
const ARRAY_FROM_MAPPER: usize = 1;

fn is_array_from(callee: Node) -> bool {
    callee.is("MemberExpression")
        && property_name(Some(callee)).as_deref() == Some("from")
        && callee.node("object").is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Array"))
}

fn number(node: Option<Node>) -> Option<f64> {
    match node.filter(|node| node.is("Literal"))?.get("value") {
        Value::Number(number) => Some(number),
        _ => None,
    }
}

fn is_fixed_length(spec: Option<Node>) -> bool {
    spec.filter(|spec| spec.is("ObjectExpression")).is_some_and(|spec| {
        spec.nodes("properties").into_iter().any(|property| {
            property.is("Property") && name(property.node("key")).as_deref() == Some("length") && number(property.node("value")).is_some_and(|length| length > 0.0)
        })
    })
}

fn is_fixed_length_array(node: Option<Node>) -> bool {
    node.filter(|node| node.is("CallExpression")).is_some_and(|node| {
        node.node("callee").is_some_and(is_array_from) && is_fixed_length(node.list("arguments").first().copied().flatten())
    })
}

fn iteration_of<'v>(call: Node<'v>, argument: Node<'v>) -> Option<Construct<'v>> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let arguments = call.list("arguments");
    if is_array_from(callee) {
        let spec = arguments.first().copied().flatten();
        let mapper = arguments.iter().position(|each| *each == Some(argument)) == Some(ARRAY_FROM_MAPPER);
        return (mapper && !is_fixed_length(spec)).then(|| Construct { node: call, name: "Array.from".into(), collection: spec });
    }
    let method = property_name(Some(callee)).filter(|method| ITERATING_METHODS.contains(&method.as_str()))?;
    if !arguments.contains(&Some(argument)) || is_fixed_length_array(callee.node("object")) {
        return None;
    }
    Some(Construct { node: call, name: method, collection: callee.node("object") })
}

fn starts_running(node: Node) -> bool {
    let declaration = node.node("init").filter(|init| init.is("VariableDeclaration")).and_then(|init| init.nodes("declarations").first().copied());
    let binary = node.node("test").filter(|test| test.is("BinaryExpression"));
    let (Some(declaration), Some(binary)) = (declaration, binary) else { return false };
    let compare: fn(f64, f64) -> bool = match binary.text("operator").as_deref() {
        Some("<") => |left, right| left < right,
        Some("<=") => |left, right| left <= right,
        Some(">") => |left, right| left > right,
        Some(">=") => |left, right| left >= right,
        Some("!=" | "!==") => |left, right| left != right,
        _ => return false,
    };
    let same_name = name(declaration.node("id")) == name(binary.node("left"));
    let (Some(start), Some(end)) = (number(declaration.node("init")), number(binary.node("right"))) else { return false };
    same_name && compare(start, end)
}

fn loop_of<'v>(node: Node<'v>, child: Node<'v>) -> Option<Construct<'v>> {
    let name = match node.kind() {
        "ForStatement" => "for",
        "ForInStatement" => "for...in",
        "ForOfStatement" => "for...of",
        "WhileStatement" => "while",
        _ => return None,
    };
    let runs_once = match node.kind() {
        "ForStatement" => node.node("init") == Some(child),
        "WhileStatement" => false,
        _ => node.node("right") == Some(child),
    };
    if runs_once {
        return None;
    }
    let collection = if node.is("ForOfStatement") || node.is("ForInStatement") { node.node("right") } else { None };
    if is_fixed_length_array(collection) || (node.is("ForStatement") && starts_running(node)) {
        return None;
    }
    let name = if node.is("ForOfStatement") && node.flag("await") { "for await...of" } else { name };
    Some(Construct { node, name: name.into(), collection })
}

fn construct_at<'v>(node: Node<'v>, child: Node<'v>) -> Option<Construct<'v>> {
    if node.is("CallExpression") { iteration_of(node, child) } else { loop_of(node, child) }
}

pub fn is_inline(function: Node) -> bool {
    function.parent().is_some_and(|parent| {
        (parent.is("CallExpression") || parent.is("NewExpression")) && (parent.nodes("arguments").contains(&function) || parent.node("callee") == Some(function))
    })
}

pub fn is_iteration_argument(node: Node) -> bool {
    node.parent().is_some_and(|parent| parent.is("CallExpression") && iteration_of(parent, node).is_some())
}

/// `loopsAround`: innermost first, up to the first function that does not run inline.
pub fn loops_around<'v>(site: Node<'v>, test: Node<'v>) -> Vec<Construct<'v>> {
    let mut inside: Vec<Node> = std::iter::once(site).chain(site.ancestors()).collect();
    match inside.iter().position(|node| *node == test) {
        Some(at) => inside.truncate(at),
        None => {
            inside.pop();
        }
    }
    let stop = inside.iter().position(|node| is_function_node(*node) && !is_inline(*node)).unwrap_or(inside.len());
    (0..stop).filter_map(|index| construct_at(inside.get(index + 1).copied().unwrap_or(test), inside[index])).collect()
}
