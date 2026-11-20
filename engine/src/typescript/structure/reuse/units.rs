//! The functions of a file as units for the near-duplicate rules: a name, a size and a tree of the body.
use super::references::Span;
use super::trees::{Lambda, TreeNode, Trees, is_space};
use crate::typescript::ParsedFile;
use crate::typescript::tree::Tree;
use oxc_ast::AstKind;
use oxc_ast::ast::{
    ClassType, Expression, FunctionType, MethodDefinitionKind, PropertyKey, PropertyKind, TSAccessibility, TSTypeAnnotation, VariableDeclarationKind,
};
use oxc_span::GetSpan;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Serialize, Debug)]
pub struct Unit {
    pub id: String,
    pub file: String,
    pub name: String,
    pub start: Option<u32>,
    pub end: Option<u32>,
    pub tokens: usize,
    #[serde(rename = "final")]
    pub is_final: bool,
    pub tree: TreeNode,
}

struct Root<'a> {
    /// The node the compiler calls the function: a method or accessor includes its key.
    index: u32,
    span: Span,
    label: String,
    lambda: Lambda<'a>,
    function: u32,
    is_final: bool,
}

fn joined(parent: &str, part: &str) -> String {
    if parent.is_empty() { part.to_string() } else { format!("{parent}.{part}") }
}

fn key_text(file: &ParsedFile, key: &PropertyKey, computed: bool) -> String {
    let span = key.span();
    if computed {
        let text = file.text;
        let open = text[..span.start as usize].rfind('[').unwrap_or(span.start as usize);
        let close = text[span.end as usize..].find(']').map_or(span.end as usize, |at| span.end as usize + at + 1);
        return text[open..close].to_string();
    }
    match key {
        PropertyKey::StringLiteral(literal) => file.halves.string(literal.value),
        PropertyKey::StaticIdentifier(name) => name.name.to_string(),
        _ => file.slice(span.start, span.end).to_string(),
    }
}

fn string_like(file: &ParsedFile, expression: Option<&Expression>) -> String {
    match expression {
        Some(Expression::StringLiteral(literal)) => file.halves.quoted(&file.halves.string(literal.value)),
        Some(Expression::TemplateLiteral(template)) if template.expressions.is_empty() => {
            file.halves.quoted(&template.quasis.first().map(|quasi| file.halves.template(quasi)).unwrap_or_default())
        }
        _ => String::new(),
    }
}

fn call_label(callee: &str, argument: String) -> String {
    let callee: String = callee.chars().filter(|character| !is_space(*character)).collect();
    let plain = !callee.is_empty() && callee.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '$' | '.' | '#'));
    format!("{}({argument})", if plain { callee.as_str() } else { "call" })
}

fn label_of(file: &ParsedFile, kind: AstKind, parent: &str) -> String {
    match kind {
        AstKind::Function(function) if matches!(function.r#type, FunctionType::FunctionDeclaration | FunctionType::TSDeclareFunction) => {
            function.id.as_ref().map_or("default".to_string(), |id| id.name.to_string())
        }
        AstKind::Class(class) if class.r#type == ClassType::ClassDeclaration => class.id.as_ref().map_or("default".to_string(), |id| id.name.to_string()),
        AstKind::VariableDeclarator(declarator) => {
            let span = declarator.id.span();
            file.slice(span.start, span.end).to_string()
        }
        AstKind::CallExpression(call) => {
            let span = call.callee.span();
            let first = call.arguments.first().and_then(|argument| argument.as_expression());
            joined(parent, &call_label(file.slice(span.start, span.end), string_like(file, first)))
        }
        AstKind::ImportExpression(import) => joined(parent, &call_label("import", string_like(file, Some(&import.source)))),
        AstKind::ObjectProperty(property) if !property.shorthand => {
            let prefix = match property.kind {
                PropertyKind::Get => "get ",
                PropertyKind::Set => "set ",
                PropertyKind::Init => "",
            };
            joined(parent, &format!("{prefix}{}", key_text(file, &property.key, property.computed)))
        }
        AstKind::AssignmentTargetPropertyProperty(property) => joined(parent, &key_text(file, &property.name, property.computed)),
        AstKind::PropertyDefinition(property) => joined(parent, &key_text(file, &property.key, property.computed)),
        AstKind::AccessorProperty(property) => joined(parent, &key_text(file, &property.key, property.computed)),
        AstKind::MethodDefinition(method) => {
            let key = key_text(file, &method.key, method.computed);
            joined(
                parent,
                &match method.kind {
                    MethodDefinitionKind::Constructor => "constructor".to_string(),
                    MethodDefinitionKind::Get => format!("get {key}"),
                    MethodDefinitionKind::Set => format!("set {key}"),
                    MethodDefinitionKind::Method => key,
                },
            )
        }
        _ => parent.to_string(),
    }
}

fn constant(tree: &Tree, index: u32) -> bool {
    let Some(declarator) = tree.parent(index).filter(|parent| matches!(tree.kind(*parent), AstKind::VariableDeclarator(_))) else { return false };
    match tree.parent(declarator).map(|parent| tree.kind(parent)) {
        Some(AstKind::VariableDeclaration(declaration)) => {
            matches!(declaration.kind, VariableDeclarationKind::Const | VariableDeclarationKind::AwaitUsing)
        }
        _ => false,
    }
}

fn root_at<'a>(tree: &Tree<'a>, index: u32, label: &str) -> Option<Root<'a>> {
    let node = &tree.nodes[index as usize];
    let label = if label.is_empty() { "<anonymous>".to_string() } else { label.to_string() };
    let own = (node.start, node.end);
    let child = |function: &oxc_ast::ast::Function| {
        tree.children(index).find(|child| matches!(tree.kind(*child), AstKind::Function(found) if std::ptr::eq(found, function)))
    };
    match node.kind {
        AstKind::MethodDefinition(method) if method.value.body.is_some() => {
            let start = method.decorators.first().map_or(own.0, |decorator| decorator.span.start.min(own.0));
            let private = method.accessibility == Some(TSAccessibility::Private) || matches!(method.key, PropertyKey::PrivateIdentifier(_));
            let is_final = method.kind == MethodDefinitionKind::Method && private;
            Some(Root { index, span: (start, own.1), label, lambda: Lambda::Function(&method.value), function: child(&method.value)?, is_final })
        }
        AstKind::ObjectProperty(property) if property.method || property.kind != PropertyKind::Init => match &property.value {
            Expression::FunctionExpression(function) if function.body.is_some() => {
                Some(Root { index, span: own, label, lambda: Lambda::Function(function), function: child(function)?, is_final: false })
            }
            _ => None,
        },
        AstKind::Function(function) if function.body.is_some() => {
            let is_final = function.r#type == FunctionType::FunctionDeclaration || constant(tree, index);
            let exported = tree.parent(index).filter(|parent| {
                matches!(tree.kind(*parent), AstKind::ExportDeclaration(_) | AstKind::ExportDefaultDeclaration(_))
                    && function.r#type == FunctionType::FunctionDeclaration
            });
            let own = (exported.map_or(own.0, |parent| tree.nodes[parent as usize].start), own.1);
            Some(Root { index, span: own, label, lambda: Lambda::Function(function), function: index, is_final })
        }
        AstKind::ArrowFunctionExpression(arrow) => {
            Some(Root { index, span: own, label, lambda: Lambda::Arrow(arrow), function: index, is_final: constant(tree, index) })
        }
        _ => None,
    }
}

fn roots<'a>(file: &ParsedFile<'a>, tree: &Tree<'a>) -> Vec<Root<'a>> {
    let mut labels: Vec<String> = vec![String::new(); tree.nodes.len()];
    let mut found = Vec::new();
    let mut index = 0u32;
    while (index as usize) < tree.nodes.len() {
        let parent = tree.parent(index).map_or("", |parent| labels[parent as usize].as_str());
        let label = label_of(file, tree.kind(index), parent);
        match root_at(tree, index, &label) {
            Some(root) => {
                index = tree.nodes[index as usize].after;
                found.push(root);
            }
            None => {
                labels[index as usize] = label;
                index += 1;
            }
        }
    }
    found.sort_by_key(|root| root.span.0);
    found
}

/// Names a unit declares: variables, parameters, and the functions and classes declared inside it.
fn bound_names<'a>(tree: &Tree<'a>, root: &Root<'a>) -> HashSet<&'a str> {
    let mut bound = HashSet::new();
    let after = tree.nodes[root.index as usize].after;
    for index in root.index..after {
        match tree.kind(index) {
            AstKind::BindingIdentifier(name) => {
                let parent = tree.parent(index);
                let declares = match parent.map(|parent| tree.kind(parent)) {
                    Some(
                        AstKind::VariableDeclarator(_)
                        | AstKind::FormalParameter(_)
                        | AstKind::CatchParameter(_)
                        | AstKind::BindingProperty(_)
                        | AstKind::ArrayPattern(_)
                        | AstKind::AssignmentPattern(_)
                        | AstKind::BindingRestElement(_),
                    ) => true,
                    Some(AstKind::Function(function)) => {
                        parent != Some(root.function) && !matches!(function.r#type, FunctionType::TSEmptyBodyFunctionExpression)
                    }
                    Some(AstKind::Class(class)) => class.r#type == ClassType::ClassDeclaration,
                    _ => false,
                };
                if declares {
                    bound.insert(name.name.as_str());
                }
            }
            AstKind::TSIndexSignatureName(name) => {
                bound.insert(name.name.as_str());
            }
            AstKind::TSThisParameter(_) => {
                bound.insert("this");
            }
            _ => {}
        }
    }
    bound
}

/// Counts what the analyzer's token pattern matches: words, quoted strings on one logical run, and any other
/// character that is not white space.
pub fn token_count(text: &str) -> usize {
    let characters: Vec<char> = text.chars().collect();
    let word = |character: char| character.is_ascii_alphanumeric() || character == '_' || character == '$';
    let mut count = 0;
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        if word(character) {
            while index < characters.len() && word(characters[index]) {
                index += 1;
            }
            count += 1;
        } else if matches!(character, '"' | '\'' | '`') {
            let mut end = index + 1;
            let closed = loop {
                match characters.get(end) {
                    None => break false,
                    Some('\\') => match characters.get(end + 1) {
                        Some('\n' | '\r' | '\u{2028}' | '\u{2029}') | None => break false,
                        Some(_) => end += 2,
                    },
                    Some(found) if *found == character => break true,
                    Some(_) => end += 1,
                }
            };
            index = if closed { end + 1 } else { index + 1 };
            count += 1;
        } else {
            if !is_space(character) {
                count += 1;
            }
            index += 1;
        }
    }
    count
}

fn return_type<'l, 'a>(lambda: &'l Lambda<'a>) -> Option<&'l TSTypeAnnotation<'a>> {
    match lambda {
        Lambda::Function(function) => function.return_type.as_deref(),
        Lambda::Arrow(arrow) => arrow.return_type.as_deref(),
    }
}

pub fn units(file: &ParsedFile, tree: &Tree, display: &str, imported: &HashMap<String, String>) -> Vec<Unit> {
    if file.source_type.is_typescript_definition() {
        return Vec::new();
    }
    let mut seen: HashMap<String, usize> = HashMap::new();
    roots(file, tree)
        .into_iter()
        .map(|root| {
            let trees = Trees { file, bound: bound_names(tree, &root), imported };
            let mut parts = vec![trees.type_of(return_type(&root.lambda))];
            parts.extend(trees.lambda_parts(&root.lambda, root.span));
            let tree = TreeNode { value: root.lambda.modifiers(), ..trees.at("function", root.span, parts) };
            let count = seen.entry(root.label.clone()).or_insert(0);
            *count += 1;
            let name = if *count == 1 { root.label } else { format!("{}#{count}", root.label) };
            Unit {
                id: format!("{display}#{name}"),
                file: display.to_string(),
                name,
                start: tree.start,
                end: tree.end,
                tokens: token_count(file.slice(root.span.0, root.span.1)),
                is_final: root.is_final,
                tree,
            }
        })
        .collect()
}
