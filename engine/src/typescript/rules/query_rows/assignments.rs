//! `assignsOnly`, `loopOf` and `mappedField`: a loop over rows whose body only sets fields to values that do not
//! depend on the row, and a `map` that picks one field of each row.
use crate::typescript::rules::held_scopes::estree_calls::is_function;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::syntax::{member_name, unwrapped};

pub struct Loop<'v> {
    pub node: Node<'v>,
    pub element: String,
    pub body: Node<'v>,
}

pub struct MappedField<'v> {
    pub call: Node<'v>,
    pub field: String,
}

fn is_date_now(call: Node) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let object = callee.node("object").map(unwrapped);
    object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Date")) && member_name(callee).as_deref() == Some("now")
}

fn root_of(node: Node) -> Node {
    let mut current = unwrapped(node);
    while current.is("MemberExpression") {
        let Some(object) = current.node("object") else { break };
        current = unwrapped(object);
    }
    current
}

fn property_values(object: Node) -> Option<Vec<Node>> {
    let mut values = Vec::new();
    for property in object.nodes("properties") {
        if !property.is("Property") || property.flag("computed") {
            return None;
        }
        values.extend(property.node("value"));
    }
    Some(values)
}

fn leaf_children<'v>(target: Node<'v>, element: &str) -> Option<Vec<Node<'v>>> {
    match target.kind() {
        "Literal" | "ThisExpression" => Some(Vec::new()),
        "Identifier" => (target.name().as_deref() != Some(element)).then(Vec::new),
        "MemberExpression" => Some(std::iter::once(root_of(target)).chain(target.node("property")).collect()),
        "NewExpression" => {
            let date = target.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Date"));
            date.then(|| target.nodes("arguments"))
        }
        "CallExpression" => is_date_now(target).then(Vec::new),
        _ => None,
    }
}

fn children_of<'v>(target: Node<'v>, element: &str) -> Option<Vec<Node<'v>>> {
    match target.kind() {
        "TemplateLiteral" => Some(target.nodes("expressions")),
        "ArrayExpression" => target.list("elements").into_iter().collect(),
        "ObjectExpression" => property_values(target),
        "UnaryExpression" => Some(target.node("argument").into_iter().collect()),
        "BinaryExpression" | "LogicalExpression" => Some(target.node("left").into_iter().chain(target.node("right")).collect()),
        "ConditionalExpression" => Some(["test", "consequent", "alternate"].into_iter().filter_map(|key| target.node(key)).collect()),
        _ => leaf_children(target, element),
    }
}

fn independent(node: Node, element: &str) -> bool {
    let mut pending = vec![node];
    while let Some(item) = pending.pop() {
        match children_of(unwrapped(item), element) {
            Some(children) => pending.extend(children),
            None => return false,
        }
    }
    true
}

fn is_field_assignment(statement: Node, element: &str) -> bool {
    let expression = if statement.is("ExpressionStatement") { statement.node("expression") } else { Some(statement) };
    let Some(assignment) = expression.filter(|expression| expression.is("AssignmentExpression")) else { return false };
    let left = assignment.node("left").filter(|left| left.is("MemberExpression"));
    let owner = left.and_then(|left| left.node("object")).filter(|object| object.is("Identifier"));
    assignment.text("operator").as_deref() == Some("=")
        && owner.is_some_and(|owner| owner.name().as_deref() == Some(element))
        && assignment.node("right").is_some_and(|right| independent(right, element))
}

pub fn assigns_only(body: Node, element: &str) -> bool {
    let statements = if body.is("BlockStatement") { body.nodes("body") } else { vec![body] };
    !statements.is_empty() && statements.into_iter().all(|statement| is_field_assignment(statement, element))
}

fn for_of_loop(statement: Node) -> Option<Loop> {
    let left = statement.node("left").filter(|left| left.is("VariableDeclaration"))?;
    let id = left.nodes("declarations").into_iter().next()?.node("id").filter(|id| id.is("Identifier"))?;
    Some(Loop { node: statement, element: id.name()?.into_owned(), body: statement.node("body")? })
}

pub fn loop_of(read: Node) -> Option<Loop> {
    let parent = read.parent()?;
    if parent.is("ForOfStatement") && parent.node("right") == Some(read) {
        return for_of_loop(parent);
    }
    let call = parent.parent()?;
    let each = parent.is("MemberExpression") && parent.node("object") == Some(read) && member_name(parent).as_deref() == Some("forEach");
    if !each || !call.is("CallExpression") || call.node("callee") != Some(parent) {
        return None;
    }
    let callback = call.nodes("arguments").into_iter().next().filter(|callback| is_function(*callback))?;
    let param = callback.nodes("params").into_iter().next().filter(|param| param.is("Identifier"))?;
    Some(Loop { node: call, element: param.name()?.into_owned(), body: callback.node("body")? })
}

fn returned_value(callback: Node) -> Option<Node> {
    let body = callback.node("body")?;
    let statements = if body.is("BlockStatement") { body.nodes("body") } else { Vec::new() };
    let single = (statements.len() == 1).then(|| statements[0]);
    let value = match single.filter(|single| single.is("ReturnStatement")) {
        Some(returned) => returned.node("argument")?,
        None => body,
    };
    (!value.is("BlockStatement")).then(|| unwrapped(value))
}

fn sole_field(callback: Node) -> Option<String> {
    let param = callback.nodes("params").into_iter().next();
    let value = returned_value(callback);
    if let Some(param) = param.filter(|param| param.is("Identifier")) {
        let member = value.filter(|value| value.is("MemberExpression") && !value.flag("computed"))?;
        let object = member.node("object").map(unwrapped)?;
        return (object.is("Identifier") && object.name() == param.name()).then(|| member_name(member)).flatten();
    }
    let properties = param.filter(|param| param.is("ObjectPattern")).map(|param| param.nodes("properties")).unwrap_or_default();
    let [only] = properties.as_slice() else { return None };
    let named = only.node("value").filter(|value| value.is("Identifier"))?;
    let value = value.filter(|value| value.is("Identifier"))?;
    if !only.is("Property") || only.flag("computed") || value.name() != named.name() {
        return None;
    }
    only.node("key").filter(|key| key.is("Identifier")).and_then(|key| key.name()).map(|name| name.into_owned())
}

/// `mappedField`: `rows.map((row) => row.field)` read at `rows`.
pub fn mapped_field(read: Node) -> Option<MappedField> {
    let member = read.parent()?;
    let call = member.parent()?;
    let mapped = member.is("MemberExpression") && member.node("object") == Some(read) && member_name(member).as_deref() == Some("map");
    if !mapped || !call.is("CallExpression") || call.node("callee") != Some(member) {
        return None;
    }
    let callback = call.nodes("arguments").into_iter().next().filter(|callback| is_function(*callback))?;
    sole_field(callback).map(|field| MappedField { call, field })
}
