//! `leafValues` of `security-values.mts` and `member-values.mts`: the values an expression can end up as,
//! through conditionals, `const` and written variables, object and enum members and class fields.
use super::{defs, flattened_properties, member_name, property_named, resolve_constant, resolved_value, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::writes::syntax::{js_number, string_value};
use std::collections::HashSet;

const MAX_DEPTH: usize = 8;
const TEXT_PRESERVING_METHODS: [&str; 4] = ["toLowerCase", "toUpperCase", "trim", "toString"];
const FUNCTION_SCOPES: [&str; 4] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "Program"];
const PATTERNS: [&str; 4] = ["ObjectPattern", "ArrayPattern", "RestElement", "Property"];

type Expansion<'s> = (Vec<Node<'s>>, Vec<Node<'s>>);

fn leaf(node: Node) -> Expansion {
    (vec![node], Vec::new())
}

/// `lookupValues`: every element of an array constant, or every property value of an object constant.
pub fn lookup_values<'s>(scopes: &Scopes<'_, 's>, object: Option<Node<'s>>) -> Option<Vec<Node<'s>>> {
    let resolved = resolved_value(scopes, object);
    if let Some(array) = resolved.filter(|array| array.is("ArrayExpression")) {
        let elements = array.list("elements");
        let values: Vec<Node> = elements.iter().flatten().copied().filter(|element| !element.is("SpreadElement")).collect();
        return (values.len() == elements.len()).then_some(values);
    }
    let entries = if resolved.is_some_and(|object| object.is("ObjectExpression")) { flattened_properties(scopes, object) } else { Vec::new() };
    let plain = !entries.is_empty() && entries.iter().all(|entry| entry.is("Property"));
    plain.then(|| entries.iter().filter_map(|entry| entry.node("value")).collect())
}

fn key_name(key: Option<Node>, computed: bool) -> Option<String> {
    let key = key?;
    if !computed && key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    if !key.is("Literal") {
        return None;
    }
    match key.get("value") {
        Value::Text(..) => string_value(Some(key)),
        Value::Number(number) => Some(js_number(number)),
        Value::Bool(flag) => Some(flag.to_string()),
        _ if key.get("bigint") != Value::Null => key.text("bigint").map(|text| text.into_owned()),
        _ if key.get("regex") != Value::Null => key.text("raw").map(|raw| raw.into_owned()),
        _ => Some("null".to_string()),
    }
}

struct MemberValue<'s> {
    fixed: bool,
    value: Node<'s>,
}

fn enum_value<'s>(declaration: Node<'s>, name: &str) -> Option<MemberValue<'s>> {
    let members = declaration.node("body").map(|body| body.nodes("members")).unwrap_or_else(|| declaration.nodes("members"));
    let member = members.into_iter().find(|entry| key_name(entry.node("id"), false).as_deref() == Some(name))?;
    member.node("initializer").map(|value| MemberValue { fixed: true, value })
}

fn class_elements(class: Node) -> Vec<Node> {
    class.node("body").map(|body| body.nodes("body")).unwrap_or_default()
}

fn field_value<'s>(class: Node<'s>, name: &str, is_static: bool) -> Option<MemberValue<'s>> {
    let field = class_elements(class).into_iter().find(|element| {
        element.is("PropertyDefinition")
            && element.flag("static") == is_static
            && element.node("value").is_some()
            && key_name(element.node("key"), element.flag("computed")).as_deref() == Some(name)
    })?;
    field.node("value").map(|value| MemberValue { fixed: field.flag("readonly"), value })
}

fn parameter_default<'s>(class: Node<'s>, name: &str) -> Option<MemberValue<'s>> {
    let constructor = class_elements(class)
        .into_iter()
        .find(|element| element.is("MethodDefinition") && element.text("kind").as_deref() == Some("constructor"))?;
    let parameters = constructor.node("value").map(|value| value.nodes("params")).unwrap_or_default();
    let property = parameters
        .into_iter()
        .filter(|parameter| parameter.is("TSParameterProperty"))
        .filter_map(|parameter| parameter.node("parameter"))
        .filter(|parameter| parameter.is("AssignmentPattern"))
        .find(|parameter| parameter.node("left").and_then(|left| left.name()).as_deref() == Some(name))?;
    property.node("right").map(|value| MemberValue { fixed: false, value })
}

fn enclosing_class(node: Node) -> Option<Node> {
    for owner in node.ancestors() {
        let method = owner.parent().is_some_and(|parent| parent.is("MethodDefinition"));
        if matches!(owner.kind(), "FunctionExpression" | "FunctionDeclaration") && !method {
            return None;
        }
        if owner.is("ClassBody") {
            return owner.parent();
        }
    }
    None
}

fn is_class(node: Node) -> bool {
    matches!(node.kind(), "ClassDeclaration" | "ClassExpression")
}

fn declared_member_value<'s>(scopes: &Scopes<'_, 's>, member: Node<'s>, name: &str) -> Option<MemberValue<'s>> {
    let object = member.node("object")?;
    if object.is("ThisExpression") {
        let owner = enclosing_class(member).filter(|owner| is_class(*owner))?;
        return field_value(owner, name, false).or_else(|| parameter_default(owner, name));
    }
    if !object.is("Identifier") {
        return None;
    }
    let owner = defs(scopes, object)
        .into_iter()
        .find(|definition| definition.kind == DefKind::ClassName || definition.node.is("TSEnumDeclaration"))
        .map(|definition| definition.node)?;
    if owner.is("TSEnumDeclaration") {
        return enum_value(owner, name);
    }
    if is_class(owner) { field_value(owner, name, true) } else { None }
}

fn member_expansion<'s>(scopes: &Scopes<'_, 's>, resolved: Node<'s>) -> Expansion<'s> {
    let name = member_name(resolved);
    let object = resolved.node("object");
    if let Some(target) = name.as_deref().and_then(|name| property_named(scopes, object, name)) {
        return (Vec::new(), vec![target]);
    }
    if resolved.flag("computed") && name.is_none() && let Some(values) = lookup_values(scopes, object) {
        return (Vec::new(), values);
    }
    let Some(name) = name else { return leaf(resolved) };
    match declared_member_value(scopes, resolved, &name) {
        None => leaf(resolved),
        Some(declared) => (if declared.fixed { Vec::new() } else { vec![resolved] }, vec![declared.value]),
    }
}

/// The `AssignmentPattern` defaults on the way from a target identifier up to the whole pattern, and that pattern.
fn pattern_defaults(identifier: Node) -> (Vec<Node>, Node) {
    let mut defaults = Vec::new();
    let mut top = identifier;
    while let Some(parent) = top.parent() {
        let left = parent.is("AssignmentPattern") && parent.node("left") == Some(top);
        if left {
            defaults.extend(parent.node("right"));
        } else if !(PATTERNS.contains(&parent.kind()) && (!parent.is("Property") || parent.node("value") == Some(top))) {
            break;
        }
        top = parent;
    }
    (defaults, top)
}

fn loop_right<'s>(statement: Option<Node<'s>>, left: Node<'s>) -> Option<Node<'s>> {
    let statement = statement.filter(|statement| matches!(statement.kind(), "ForInStatement" | "ForOfStatement"))?;
    if statement.node("left") == Some(left) { statement.node("right") } else { None }
}

/// The `writeExpr` of each write reference ESLint makes for a declared name.
fn declared_writes(definition: Node) -> Vec<Node> {
    let (mut writes, top) = pattern_defaults(definition);
    let declarator = top.parent().filter(|declarator| declarator.is("VariableDeclarator") && declarator.node("id") == Some(top));
    if let Some(declarator) = declarator {
        let declaration = declarator.parent();
        let init = declarator.node("init").or_else(|| declaration.and_then(|declaration| loop_right(declaration.parent(), declaration)));
        writes.extend(init);
    }
    writes
}

/// The catch clause whose parameter takes the writes of a `var` of the same name declared in its body: ESLint
/// resolves the declarator's write in the catch scope.
fn catching_clause(name: Node) -> Option<Node> {
    let text = name.name()?;
    let declaration = name.ancestors().find(|node| node.is("VariableDeclaration"))?;
    if declaration.text("kind").as_deref() != Some("var") {
        return None;
    }
    for owner in declaration.ancestors() {
        if FUNCTION_SCOPES.contains(&owner.kind()) {
            return None;
        }
        let param = owner.node("param").filter(|param| owner.is("CatchClause") && param.is("Identifier"));
        if param.is_some_and(|param| param.name().as_deref() == Some(text.as_ref())) {
            return Some(owner);
        }
    }
    None
}

/// The `var` declarations of a catch parameter's name in the clause's body, outside nested functions.
fn caught_names<'s>(clause: Node<'s>, name: &str) -> Vec<Node<'s>> {
    let body = clause.node("body").map(|body| body.descendants()).unwrap_or_default();
    body.into_iter()
        .filter(|node| node.is("Identifier") && node.name().as_deref() == Some(name))
        .filter(|node| catching_clause(*node) == Some(clause))
        .filter(|node| {
            let (_, top) = pattern_defaults(*node);
            top.parent().is_some_and(|declarator| declarator.is("VariableDeclarator") && declarator.node("id") == Some(top))
        })
        .collect()
}

/// The `writeExpr` of each write reference ESLint makes for an assigned name.
fn assigned_writes(identifier: Node) -> Vec<Node> {
    let (mut writes, top) = pattern_defaults(identifier);
    let parent = top.parent();
    let assigned = parent.filter(|parent| parent.is("AssignmentExpression") && parent.node("left") == Some(top)).and_then(|parent| parent.node("right"));
    writes.extend(assigned.or_else(|| loop_right(parent, top)));
    writes
}

fn written_values<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Vec<Node<'s>> {
    let Some(name) = identifier.name() else { return Vec::new() };
    let Some(variable) = scopes.variable_by_name(&name, identifier.start()) else { return Vec::new() };
    let definitions = scopes.defs(variable);
    let mut found: Vec<Node> = Vec::new();
    let mut add = |node: Node<'s>| {
        if !found.contains(&node) {
            found.push(node);
        }
    };
    for definition in &definitions {
        let default = definition.name.parent().filter(|parent| parent.is("AssignmentPattern"));
        default.and_then(|parent| parent.node("right")).into_iter().for_each(&mut add);
    }
    let names: Vec<Node> = definitions.iter().map(|definition| definition.name).collect();
    for definition in &definitions {
        let caught = definition.kind == DefKind::Variable && catching_clause(definition.name).is_some();
        if matches!(definition.kind, DefKind::Variable | DefKind::Parameter | DefKind::CatchClause) && !caught {
            declared_writes(definition.name).into_iter().for_each(&mut add);
        }
        if definition.kind == DefKind::CatchClause && definition.node.node("param") == Some(definition.name) {
            for declared in caught_names(definition.node, &name) {
                declared_writes(declared).into_iter().for_each(&mut add);
            }
        }
    }
    for reference in scopes.references(variable) {
        if reference.write && !names.contains(&reference.identifier) {
            assigned_writes(reference.identifier).into_iter().for_each(&mut add);
        }
    }
    found
}

fn for_of_elements<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Vec<Node<'s>>> {
    let definition = defs(scopes, identifier).into_iter().next().filter(|definition| definition.kind == DefKind::Variable)?;
    let declaration = definition.node.parent()?;
    let statement = declaration.parent().filter(|statement| statement.is("ForOfStatement"))?;
    let direct = definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    let constant = declaration.text("kind").as_deref() == Some("const");
    if statement.node("left") != Some(declaration) || !direct || !constant {
        return None;
    }
    lookup_values(scopes, statement.node("right"))
}

fn call_expansion(resolved: Node) -> Expansion {
    let callee = resolved.node("callee").filter(|callee| callee.is("MemberExpression"));
    let preserving = callee.is_some_and(|callee| member_name(callee).is_some_and(|name| TEXT_PRESERVING_METHODS.contains(&name.as_str())));
    match callee.and_then(|callee| callee.node("object")) {
        Some(object) if preserving => (Vec::new(), vec![object]),
        _ => leaf(resolved),
    }
}

fn expansion_of<'s>(scopes: &Scopes<'_, 's>, resolved: Node<'s>) -> Expansion<'s> {
    match resolved.kind() {
        "ConditionalExpression" => (Vec::new(), resolved.node("consequent").into_iter().chain(resolved.node("alternate")).collect()),
        "LogicalExpression" => (Vec::new(), resolved.node("left").into_iter().chain(resolved.node("right")).collect()),
        "Identifier" => match for_of_elements(scopes, resolved) {
            Some(elements) => (Vec::new(), elements),
            None => (vec![resolved], written_values(scopes, resolved)),
        },
        "MemberExpression" => member_expansion(scopes, resolved),
        "CallExpression" => call_expansion(resolved),
        _ => leaf(resolved),
    }
}

/// `leafValues`: the values an expression can take, eight steps deep.
pub fn leaf_values<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Vec<Node<'s>> {
    let mut leaves = Vec::new();
    let mut expanded: HashSet<u32> = HashSet::new();
    let mut pending: Vec<(Option<Node>, usize)> = vec![(node, 0)];
    let mut at = 0;
    while at < pending.len() {
        let (node, depth) = pending[at];
        at += 1;
        let Some(resolved) = resolve_constant(scopes, node.map(unwrapped)).map(unwrapped) else { continue };
        if depth > MAX_DEPTH || !expanded.insert(resolved.index) {
            continue;
        }
        let (found, next) = expansion_of(scopes, resolved);
        leaves.extend(found);
        pending.extend(next.into_iter().map(|child| (Some(child), depth + 1)));
    }
    leaves
}
