//! What a callee name stands for: its declaration through aliases and shorthand properties, the function with a
//! body that declaration holds, and the package a declaration belongs to.
use super::super::packages::package_from_path;
use super::super::views::At;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;

const WITH_BODY: [u32; 5] = [k::FUNCTION_DECLARATION, k::METHOD_DECLARATION, k::FUNCTION_EXPRESSION, k::ARROW_FUNCTION, k::GET_ACCESSOR];

fn with_body(node: &At) -> bool {
    WITH_BODY.contains(&node.kind()) && node.child("body").is_some()
}

/// `unwrappedExpression`: through parentheses and `as`.
pub fn unwrapped(node: &At) -> At {
    let mut current = node.clone();
    while matches!(current.kind(), k::PARENTHESIZED_EXPRESSION | k::AS_EXPRESSION) {
        let Some(inner) = current.child("expression") else { break };
        current = inner;
    }
    current
}

/// `functionLike`: the declaration when it is a function with a body, or the function a variable, property
/// or property assignment starts as.
pub fn function_like(declaration: &At) -> Option<At> {
    if with_body(declaration) {
        return Some(declaration.clone());
    }
    let holds_value = matches!(declaration.kind(), k::VARIABLE_DECLARATION | k::PROPERTY_DECLARATION | k::PROPERTY_ASSIGNMENT);
    let value = declaration.child("initializer").filter(|_| holds_value).map(|initializer| unwrapped(&initializer))?;
    with_body(&value).then_some(value)
}

pub fn nodes(types: &mut Types, handles: &[String]) -> Vec<At> {
    handles.iter().filter_map(|handle| At::of(types, handle)).collect()
}

pub fn resolved_symbol(types: &mut Types, node: &At) -> Option<u64> {
    let symbol = types.symbol_at_handle(&node.handle());
    types.unaliased(symbol).map(|symbol| symbol.id)
}

/// `calleeDeclaration`.
pub fn callee_declaration(types: &mut Types, node: &At) -> Option<At> {
    let symbol = types.symbol_at_handle(&node.handle());
    let mut symbol = types.unaliased(symbol);
    let declarations = nodes(types, symbol.as_ref().map(|symbol| symbol.declarations.as_slice()).unwrap_or_default());
    if let Some(shorthand) = declarations.iter().find(|declaration| declaration.is(k::SHORTHAND_PROPERTY_ASSIGNMENT)) {
        let value = types.shorthand_value_symbol(&shorthand.handle());
        symbol = types.unaliased(value);
    }
    let declarations = nodes(types, symbol.as_ref().map(|symbol| symbol.declarations.as_slice()).unwrap_or_default());
    declarations.iter().find(|declaration| function_like(declaration).is_some()).or(declarations.first()).cloned()
}

fn ambient_module(declaration: &At) -> Option<String> {
    declaration.chain().find_map(|node| {
        let name = node.child("name").filter(|name| node.is(k::MODULE_DECLARATION) && name.is(k::STRING_LITERAL))?;
        Some(name.text().unwrap_or_default())
    })
}

/// `declarationPackage`: `lib` for the default library, the module an ambient module declaration names, or the
/// package of a `node_modules` file.
pub fn declaration_package(types: &mut Types, declaration: &At) -> Option<String> {
    if types.file_origin(&declaration.path).default_library {
        return Some("lib".to_string());
    }
    ambient_module(declaration).or_else(|| package_from_path(&declaration.path))
}

fn required_module(declaration: &At) -> Option<String> {
    let variable = declaration.chain().find(|node| node.is(k::VARIABLE_DECLARATION))?;
    let init = variable.child("initializer").filter(|init| init.is(k::CALL_EXPRESSION))?;
    let arguments = init.listed("arguments");
    let required = init.child("expression").and_then(|callee| callee.identifier()).is_some_and(|name| name == "require") && arguments.len() == 1;
    arguments.first().filter(|argument| required && argument.is(k::STRING_LITERAL)).map(|argument| argument.text().unwrap_or_default())
}

/// `importedPackage`: the module the root identifier of a call chain is imported or required from.
pub fn imported_package(types: &mut Types, root: Option<&At>) -> Option<String> {
    let symbol = types.symbol_at_handle(&root?.handle())?;
    let declaration = At::of(types, symbol.declarations.first()?)?;
    let statement = declaration.chain().find(|node| node.is(k::IMPORT_DECLARATION));
    match statement.and_then(|statement| statement.child("moduleSpecifier")) {
        Some(specifier) if specifier.is(k::STRING_LITERAL) => specifier.text(),
        _ => required_module(&declaration),
    }
}

/// `containerName`: the name of the class or interface a declaration is a member of.
pub fn container_name(declaration: &At) -> Option<String> {
    let container = declaration.parent()?;
    let named = matches!(container.kind(), k::CLASS_DECLARATION | k::CLASS_EXPRESSION | k::INTERFACE_DECLARATION);
    container.child("name").filter(|_| named).and_then(|name| name.text())
}
