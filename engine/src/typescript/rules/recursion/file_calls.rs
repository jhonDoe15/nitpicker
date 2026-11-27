//! `recursion/graph/file-calls.mts`: the module-level functions and class members of a file, keyed by owner and
//! name, and the key a call reaches.
use crate::typescript::rules::support::view::Node;

const MODULE: &str = "";
const CALLABLES: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

pub struct FileFunction<'v> {
    pub key: String,
    pub name: String,
    pub node: Node<'v>,
    pub owner: String,
    pub params: Vec<String>,
}

/// The node and everything under it, parents before children, as `depthFirst` over `nodeChildren` walks them.
pub fn descendants<'v>(root: Node<'v>) -> Vec<Node<'v>> {
    let mut found = Vec::new();
    let mut pending = vec![root];
    while let Some(node) = pending.pop() {
        found.push(node);
        pending.extend(node.estree_children().into_iter().rev());
    }
    found
}

pub fn is_callable(node: Option<Node>) -> bool {
    node.is_some_and(|node| CALLABLES.contains(&node.kind()))
}

fn is_module_level(statement: Option<Node>) -> bool {
    statement.is_some_and(|statement| statement.is("Program") || statement.is("ExportNamedDeclaration"))
}

fn param_names(function: Node) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for param in function.nodes("params") {
        let inner = if param.is("AssignmentPattern") { param.node("left") } else { Some(param) };
        let named = if inner.is_some_and(|inner| inner.is("TSParameterProperty")) { inner.and_then(|inner| inner.node("parameter")) } else { inner };
        if let Some(name) = named.and_then(|named| named.name()) {
            if !names.iter().any(|known| *known == name) {
                names.push(name.into_owned());
            }
        }
    }
    names
}

fn entry<'v>(owner: &str, name: &str, node: Node<'v>) -> FileFunction<'v> {
    FileFunction { key: format!("{owner}#{name}"), name: name.to_string(), node, owner: owner.to_string(), params: param_names(node) }
}

fn class_name(body: Node) -> String {
    let parent = body.parent();
    let name = parent.and_then(|parent| parent.node("id")).and_then(|id| id.name()).map_or_else(|| "class".to_string(), |name| name.into_owned());
    format!("{name}@{}", parent.map_or(0, |parent| parent.start()))
}

fn member_entry<'v>(member: Node<'v>, owner: &str) -> Option<FileFunction<'v>> {
    let is_member = member.is("MethodDefinition") || member.is("PropertyDefinition");
    let name = member.node("key").filter(|_| is_member && !member.flag("computed")).and_then(|key| key.name())?;
    let value = member.node("value").filter(|value| is_callable(Some(*value)))?;
    Some(entry(owner, &name, value))
}

fn module_entry(node: Node) -> Option<FileFunction> {
    if node.is("FunctionDeclaration") {
        let name = node.node("id").and_then(|id| id.name()).filter(|_| is_module_level(node.parent()))?;
        return Some(entry(MODULE, &name, node));
    }
    let declaration = node.parent().filter(|_| node.is("VariableDeclarator"))?;
    let id = node.node("id").filter(|id| id.is("Identifier") && is_module_level(declaration.parent()))?;
    let init = node.node("init").filter(|init| is_callable(Some(*init)))?;
    Some(entry(MODULE, &id.name()?, init))
}

/// The functions a call graph of the file joins; a later function with the same key takes the earlier one's place.
pub fn functions_of<'v>(program: Node<'v>) -> Vec<FileFunction<'v>> {
    let mut functions: Vec<FileFunction> = Vec::new();
    let mut places: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for node in descendants(program) {
        let found: Vec<FileFunction> = if node.is("ClassBody") {
            let owner = class_name(node);
            node.nodes("body").into_iter().filter_map(|member| member_entry(member, &owner)).collect()
        } else {
            module_entry(node).into_iter().collect()
        };
        for function in found {
            match places.get(&function.key) {
                Some(place) => functions[*place] = function,
                None => {
                    places.insert(function.key.clone(), functions.len());
                    functions.push(function);
                }
            }
        }
    }
    functions
}

pub fn called_key(call: Node, owner: &str) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("Identifier") {
        return Some(format!("{MODULE}#{}", callee.name()?));
    }
    let on_this = callee.is("MemberExpression") && callee.node("object").is_some_and(|object| object.is("ThisExpression")) && !callee.flag("computed");
    let property = callee.node("property").and_then(|property| property.name()).map_or_else(|| "undefined".to_string(), |name| name.into_owned());
    on_this.then(|| format!("{owner}#{property}"))
}
