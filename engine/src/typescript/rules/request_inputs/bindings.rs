//! `import-bindings.mts` and `ts-nodes.mts`: imports, top-level declarations and decorators, by name and syntax alone
//! (the plugin runs these rules without a type checker).
use super::tree::{is_pa, member_text, name_of, string_literal, Tree, T};
use crate::typescript::rules::support::view::Node;

const MAX_ALIAS_DEPTH: usize = 4;

pub struct ImportBinding {
    pub source: Option<String>,
    pub imported: Option<String>,
}

pub struct DecoratorCall<'v> {
    pub name: Option<String>,
    pub base: Option<Node<'v>>,
    pub arguments: Vec<T<'v>>,
}

/// The program's statements as the compiler lists them: an `export` is a modifier there, not a statement.
pub fn statements<'v>(program: Node<'v>) -> Vec<Node<'v>> {
    program.nodes("body").into_iter().map(|statement| match statement.kind() {
        "ExportNamedDeclaration" | "ExportDefaultDeclaration" => statement.node("declaration").filter(|inner| is_declaration(*inner)).unwrap_or(statement),
        _ => statement,
    }).collect()
}

fn is_declaration(node: Node) -> bool {
    matches!(node.kind(), "VariableDeclaration" | "ClassDeclaration" | "FunctionDeclaration" | "TSTypeAliasDeclaration" | "TSInterfaceDeclaration" | "TSEnumDeclaration" | "TSModuleDeclaration" | "TSDeclareFunction")
}

fn imported_name(declaration: Node, name: &str) -> Option<String> {
    let specifiers = declaration.nodes("specifiers");
    let local = |specifier: &Node| specifier.node("local").and_then(|local| local.name()).as_deref() == Some(name);
    if specifiers.iter().any(|specifier| specifier.is("ImportDefaultSpecifier") && local(specifier)) {
        return Some("default".to_string());
    }
    if let Some(namespace) = specifiers.iter().find(|specifier| specifier.is("ImportNamespaceSpecifier")) {
        return local(namespace).then(|| "*".to_string());
    }
    let element = specifiers.into_iter().find(|specifier| specifier.is("ImportSpecifier") && local(specifier))?;
    let imported = element.node("imported")?;
    Some(imported.name().map(|name| name.into_owned()).or_else(|| crate::typescript::rules::urls::values::string_value(Some(imported))).unwrap_or_default())
}

/// The compiler's `name` of a binding element: the identifier or pattern it binds.
pub fn element_name(element: Node) -> Option<Node> {
    match element.kind() {
        "RestElement" => element.node("argument"),
        "Property" => element.node("value").map(|value| if value.is("AssignmentPattern") { value.node("left").unwrap_or(value) } else { value }),
        "AssignmentPattern" => element.node("left"),
        _ => Some(element),
    }
}

fn required_name(tree: &Tree, declaration: Node, name: &str) -> Option<ImportBinding> {
    let call = tree.field(declaration, "init")?.bare().filter(|call| call.is("CallExpression"))?;
    let callee = tree.field(call, "callee")?.bare()?;
    if !callee.is("Identifier") || callee.name().as_deref() != Some("require") {
        return None;
    }
    let source = string_literal(tree.fields(call, "arguments").first().copied().flatten());
    let id = declaration.node("id")?;
    if id.is("Identifier") {
        return (id.name().as_deref() == Some(name)).then_some(ImportBinding { source, imported: Some("*".to_string()) });
    }
    if !id.is("ObjectPattern") {
        return None;
    }
    let element = id.nodes("properties").into_iter().find(|element| name_of(tree.slot(element_name(*element))).as_deref() == Some(name))?;
    let imported = if element.is("Property") && !element.flag("shorthand") {
        if element.flag("computed") { None } else { name_of(tree.field(element, "key")) }
    } else {
        name_of(tree.slot(element_name(element)))
    };
    Some(ImportBinding { source, imported })
}

fn statement_binding(tree: &Tree, statement: Node, name: &str) -> Option<ImportBinding> {
    if statement.is("ImportDeclaration") {
        let found = imported_name(statement, name)?;
        return Some(ImportBinding { source: string_literal(tree.field(statement, "source")), imported: Some(found) });
    }
    if !statement.is("VariableDeclaration") {
        return None;
    }
    statement.nodes("declarations").into_iter().find_map(|declaration| required_name(tree, declaration, name))
}

pub fn top_level_import(tree: &Tree, name: &str) -> Option<ImportBinding> {
    statements(tree.view.program()).into_iter().find_map(|statement| statement_binding(tree, statement, name))
}

fn declared_names(statement: Node) -> Vec<(Option<String>, Node)> {
    if statement.is("ClassDeclaration") || statement.is("TSTypeAliasDeclaration") {
        return statement.node("id").map(|id| vec![(id.name().map(|name| name.into_owned()), statement)]).unwrap_or_default();
    }
    if !statement.is("VariableDeclaration") {
        return Vec::new();
    }
    statement.nodes("declarations").into_iter().map(|entry| {
        let id = entry.node("id").filter(|id| id.is("Identifier"));
        (id.and_then(|id| id.name().map(|name| name.into_owned())), entry)
    }).collect()
}

fn top_level_declaration<'v>(tree: &Tree<'v>, name: &str) -> Option<Node<'v>> {
    statements(tree.view.program()).into_iter().find_map(|statement| declared_names(statement).into_iter().find(|(declared, _)| declared.as_deref() == Some(name)).map(|(_, node)| node))
}

/// The compiler's function-like nodes: a method's function is part of the method there.
pub fn is_function_like(node: Node) -> bool {
    match node.kind() {
        "FunctionExpression" | "TSEmptyBodyFunctionExpression" => !is_method_value(node),
        "FunctionDeclaration" | "ArrowFunctionExpression" | "TSDeclareFunction" | "TSMethodSignature" | "TSCallSignatureDeclaration" | "TSConstructSignatureDeclaration" | "TSIndexSignature" | "TSFunctionType" | "TSConstructorType" | "MethodDefinition" | "TSAbstractMethodDefinition" => true,
        "Property" => node.flag("method") || node.text("kind").is_some_and(|kind| kind != "init"),
        _ => false,
    }
}

pub fn is_method_value(node: Node) -> bool {
    node.parent().is_some_and(|parent| match parent.kind() {
        "MethodDefinition" | "TSAbstractMethodDefinition" => true,
        "Property" => parent.flag("method") || parent.text("kind").is_some_and(|kind| kind != "init"),
        _ => false,
    } && parent.node("value") == Some(node))
}

/// The parameters of a function-like node.
pub fn parameters(node: Node) -> Vec<Node> {
    let function = match node.kind() {
        "MethodDefinition" | "TSAbstractMethodDefinition" | "Property" => node.node("value"),
        _ => Some(node),
    };
    function.map(|function| if function.has("parameters") { function.nodes("parameters") } else { function.nodes("params") }).unwrap_or_default()
}

/// The compiler's `name` of a parameter.
pub fn parameter_name(parameter: Node) -> Option<Node> {
    match parameter.kind() {
        "TSParameterProperty" => parameter.node("parameter").and_then(parameter_name),
        "AssignmentPattern" => parameter.node("left"),
        "RestElement" => parameter.node("argument"),
        _ => Some(parameter),
    }
}

fn declares_name(tree: &Tree, node: Node, name: &str) -> bool {
    if is_function_like(node) && parameters(node).into_iter().any(|parameter| name_of(tree.slot(parameter_name(parameter))).as_deref() == Some(name)) {
        return true;
    }
    let statements = match node.kind() {
        "BlockStatement" | "StaticBlock" => node.nodes("body"),
        _ => Vec::new(),
    };
    statements.into_iter().any(|statement| statement.is("VariableDeclaration") && statement.nodes("declarations").into_iter().any(|entry| name_of(tree.field(entry, "id")).as_deref() == Some(name)))
}

fn is_shadowed(tree: &Tree, identifier: Node) -> bool {
    let Some(name) = identifier.name() else { return false };
    identifier.ancestors().filter(|node| !node.is("Program")).any(|node| declares_name(tree, node, &name))
}

pub fn import_of(tree: &Tree, identifier: Node) -> Option<ImportBinding> {
    if is_shadowed(tree, identifier) {
        return None;
    }
    top_level_import(tree, &identifier.name()?)
}

pub fn is_from_package(tree: &Tree, identifier: Option<Node>, packages: &[&str]) -> bool {
    let Some(source) = identifier.and_then(|identifier| import_of(tree, identifier)).and_then(|binding| binding.source) else { return false };
    packages.iter().any(|name| source == *name || source.starts_with(&format!("{name}/")))
}

/// `declarationOf` without a checker.
pub fn declaration_of<'v>(tree: &Tree<'v>, identifier: Node<'v>) -> Option<Node<'v>> {
    if is_shadowed(tree, identifier) {
        return None;
    }
    top_level_declaration(tree, &identifier.name()?)
}

/// `baseIdentifier`: through property accesses and calls to the identifier they start from.
pub fn base_identifier<'v>(tree: &Tree<'v>, start: T<'v>) -> Option<Node<'v>> {
    let mut current = start;
    loop {
        let node = current.bare()?;
        if is_pa(node) {
            current = tree.field(node, "object")?;
        } else if node.is("CallExpression") {
            current = tree.field(node, "callee")?;
        } else {
            return node.is("Identifier").then_some(node);
        }
    }
}

fn wrapped<'v>(tree: &Tree<'v>, node: Node<'v>) -> Option<T<'v>> {
    matches!(node.kind(), "TSAsExpression" | "TSSatisfiesExpression" | "TSNonNullExpression").then(|| tree.field(node, "expression")).flatten()
}

/// `resolvedExpression`: through parentheses, casts and `const` aliases to the expression they stand for.
pub fn resolved_expression<'v>(tree: &Tree<'v>, start: Option<T<'v>>) -> Option<T<'v>> {
    let mut current = start?;
    let mut length = 1;
    loop {
        let next = if current.level > 0 {
            Some(T { node: current.node, level: current.level - 1 })
        } else if let Some(inner) = wrapped(tree, current.node) {
            Some(inner)
        } else if current.node.is("Identifier") && length <= MAX_ALIAS_DEPTH * 2 {
            declaration_of(tree, current.node).filter(|declaration| declaration.is("VariableDeclarator")).and_then(|declaration| tree.field(declaration, "init"))
        } else {
            None
        };
        match next {
            Some(next) => {
                current = next;
                length += 1;
            }
            None => break,
        }
    }
    (!current.is("Identifier")).then_some(current)
}

pub fn decorators_of(node: Node) -> Vec<Node> {
    node.nodes("decorators")
}

fn exported_name(tree: &Tree, callee: T) -> Option<String> {
    let imported = callee.bare().filter(|node| node.is("Identifier")).and_then(|node| import_of(tree, node)).and_then(|binding| binding.imported);
    match imported {
        Some(imported) if imported != "*" && imported != "default" => Some(imported),
        _ => name_of(Some(callee)),
    }
}

pub fn decorator_call<'v>(tree: &Tree<'v>, decorator: Node<'v>) -> DecoratorCall<'v> {
    let Some(expression) = tree.field(decorator, "expression") else { return DecoratorCall { name: None, base: None, arguments: Vec::new() } };
    let call = expression.bare().filter(|node| node.is("CallExpression"));
    let callee = call.and_then(|call| tree.field(call, "callee")).unwrap_or(expression);
    let name = match callee.bare() {
        Some(node) if is_pa(node) => member_text(node),
        _ => exported_name(tree, callee),
    };
    let arguments = call.map(|call| tree.fields(call, "arguments").into_iter().flatten().collect()).unwrap_or_default();
    DecoratorCall { name, base: base_identifier(tree, callee), arguments }
}
