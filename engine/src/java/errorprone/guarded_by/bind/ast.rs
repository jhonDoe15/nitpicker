//! The expressions the binder understands, read from a tree or from the string of an annotation.
use crate::engine::source::{children, named_children};
use crate::java::errorprone::Context;
use tree_sitter::Node;

pub enum Ast<'t> {
    Ident(String, Option<Node<'t>>),
    /// A member select; `this` and `class` as names are the qualified forms.
    Select(Box<Ast<'t>>, String, Option<Node<'t>>),
    Call { object: Option<Box<Ast<'t>>>, name: String, nullary: bool, node: Option<Node<'t>> },
    Paren(Box<Ast<'t>>),
    MemberRef(Box<Ast<'t>>, String, Option<Node<'t>>),
    Other,
}

fn parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The tree as the binder reads it.
pub fn from_node<'t>(context: &Context, node: Node<'t>) -> Ast<'t> {
    match node.kind() {
        "identifier" | "this" | "super" | "type_identifier" | "scoped_type_identifier" | "scoped_identifier" => Ast::Ident(context.text(node).split_whitespace().collect(), Some(node)),
        "parenthesized_expression" => parts(node).first().map_or(Ast::Other, |inner| Ast::Paren(Box::new(from_node(context, *inner)))),
        "field_access" => {
            let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return Ast::Other };
            Ast::Select(Box::new(from_node(context, object)), context.text(field).to_string(), Some(node))
        }
        "class_literal" => match parts(node).first() {
            Some(inner) if matches!(inner.kind(), "type_identifier" | "scoped_type_identifier") => Ast::Select(Box::new(from_node(context, *inner)), "class".to_string(), Some(node)),
            _ => Ast::Other,
        },
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name") else { return Ast::Other };
            let nullary = node.child_by_field_name("arguments").is_some_and(|list| parts(list).is_empty()) && !children(node).iter().any(|part| part.kind() == "type_arguments");
            let object = node.child_by_field_name("object").map(|object| Box::new(from_node(context, object)));
            Ast::Call { object, name: context.text(name).to_string(), nullary, node: Some(node) }
        }
        "method_reference" => {
            let kids = parts(node);
            match (kids.first(), kids.get(1)) {
                (Some(qualifier), Some(name)) if kids.len() == 2 && name.kind() == "identifier" => Ast::MemberRef(Box::new(from_node(context, *qualifier)), context.text(*name).to_string(), Some(node)),
                _ => Ast::Other,
            }
        }
        _ => Ast::Other,
    }
}

const KEYWORDS: &[&str] = &[
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "const", "continue", "default", "do", "double", "else", "enum", "extends", "false", "final",
    "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "null", "package", "private", "protected",
    "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "throw", "throws", "transient", "true", "try", "void", "volatile", "while", "_",
];

#[derive(PartialEq, Clone, Debug)]
enum Token {
    Name(String),
    Dot,
    Open,
    Close,
    Colons,
}

fn skip_space(chars: &[char], mut at: usize) -> Option<usize> {
    loop {
        match chars.get(at) {
            Some(c) if c.is_whitespace() => at += 1,
            Some('/') if chars.get(at + 1) == Some(&'*') => {
                at += 2;
                while !(chars.get(at) == Some(&'*') && chars.get(at + 1) == Some(&'/')) {
                    chars.get(at)?;
                    at += 1;
                }
                at += 2;
            }
            Some('/') if chars.get(at + 1) == Some(&'/') => {
                while chars.get(at).is_some_and(|c| *c != '\n') {
                    at += 1;
                }
            }
            _ => return Some(at),
        }
    }
}

/// The tokens, or nothing when a character is none javac's expressions use here or when anything follows the last token.
fn tokens(text: &str) -> Option<Vec<Token>> {
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut at = 0;
    let mut end = 0;
    while at < chars.len() {
        match chars[at] {
            '.' => found.push(Token::Dot),
            '(' => found.push(Token::Open),
            ')' => found.push(Token::Close),
            ':' if chars.get(at + 1) == Some(&':') => {
                found.push(Token::Colons);
                at += 1;
            }
            c if c.is_alphabetic() || c == '_' || c == '$' => {
                let start = at;
                while chars.get(at + 1).is_some_and(|c| c.is_alphanumeric() || *c == '_' || *c == '$') {
                    at += 1;
                }
                found.push(Token::Name(chars[start..=at].iter().collect()));
            }
            _ => return None,
        }
        at += 1;
        end = at;
        at = skip_space(&chars, at)?;
    }
    (end == chars.len()).then_some(found)
}

fn primary<'t>(tokens: &[Token], at: &mut usize) -> Option<Ast<'t>> {
    match tokens.get(*at)? {
        Token::Name(name) if name == "this" || name == "super" || !KEYWORDS.contains(&name.as_str()) => {
            *at += 1;
            Some(Ast::Ident(name.clone(), None))
        }
        Token::Open => {
            *at += 1;
            let inner = expression(tokens, at)?;
            (tokens.get(*at)? == &Token::Close).then(|| *at += 1)?;
            Some(Ast::Paren(Box::new(inner)))
        }
        _ => None,
    }
}

fn expression<'t>(tokens: &[Token], at: &mut usize) -> Option<Ast<'t>> {
    let mut current = primary(tokens, at)?;
    loop {
        match tokens.get(*at) {
            Some(Token::Dot) => {
                let Some(Token::Name(name)) = tokens.get(*at + 1) else { return None };
                if name != "this" && name != "class" && KEYWORDS.contains(&name.as_str()) {
                    return None;
                }
                *at += 2;
                current = if tokens.get(*at) == Some(&Token::Open) && tokens.get(*at + 1) == Some(&Token::Close) {
                    *at += 2;
                    Ast::Call { object: Some(Box::new(current)), name: name.clone(), nullary: true, node: None }
                } else {
                    Ast::Select(Box::new(current), name.clone(), None)
                };
            }
            Some(Token::Open) if matches!(current, Ast::Ident(..)) && tokens.get(*at + 1) == Some(&Token::Close) => {
                let Ast::Ident(name, _) = current else { return None };
                *at += 2;
                current = Ast::Call { object: None, name, nullary: true, node: None };
            }
            Some(Token::Colons) => {
                let Some(Token::Name(name)) = tokens.get(*at + 1) else { return None };
                *at += 2;
                current = Ast::MemberRef(Box::new(current), name.clone(), None);
            }
            _ => return Some(current),
        }
    }
}

/// Parses the string of an annotation: the whole text must be one expression of a kind the binder knows.
pub fn parse<'t>(text: &str) -> Option<Ast<'t>> {
    if text.chars().next()?.is_whitespace() || text.chars().last()?.is_whitespace() {
        return None;
    }
    let tokens = tokens(text)?;
    let mut at = 0;
    let found = expression(&tokens, &mut at)?;
    (at == tokens.len()).then_some(found)
}
