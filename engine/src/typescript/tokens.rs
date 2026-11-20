//! The token texts the Node analyzer reads off the compiler's tree: one text per token, with string and
//! template tokens written as the compiler's token kind and cooked value, and JSX text trimmed.
use super::ParsedFile;
use super::tree::Tree;
use oxc_ast::AstKind;
use oxc_parser::Kind;
use std::collections::HashMap;

/// Token kind numbers of the TypeScript compiler (6.0), which the analyzer writes into the text.
const STRING_LITERAL: u32 = 11;
const NO_SUBSTITUTION_TEMPLATE: u32 = 15;
const TEMPLATE_HEAD: u32 = 16;
const TEMPLATE_MIDDLE: u32 = 17;
const TEMPLATE_TAIL: u32 = 18;

pub struct TokenTexts<'t, 'a> {
    file: &'t ParsedFile<'a>,
    /// Cooked values of string literals by token start, and of template parts by the start of their text.
    cooked: HashMap<u32, String>,
}

fn collapsed(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl<'t, 'a> TokenTexts<'t, 'a> {
    pub fn of(file: &'t ParsedFile<'a>, tree: &Tree<'a>) -> TokenTexts<'t, 'a> {
        let mut cooked = HashMap::new();
        for node in &tree.nodes {
            match node.kind {
                AstKind::StringLiteral(literal) => {
                    cooked.insert(node.start, literal.value.display().to_string());
                }
                AstKind::TemplateElement(element) => {
                    cooked.insert(node.start, element.value.cooked.map(|value| value.display().to_string()).unwrap_or_default());
                }
                _ => {}
            }
        }
        TokenTexts { file, cooked }
    }

    fn text(&self, token: &oxc_parser::Token) -> String {
        let (start, end) = (token.start(), token.end());
        let template = |kind: u32| format!("{kind}:{}", self.cooked.get(&(start + 1)).map_or("", String::as_str));
        match token.kind() {
            Kind::Str => match self.cooked.get(&start) {
                Some(value) => format!("{STRING_LITERAL}:{value}"),
                None => self.file.slice(start, end).to_string(),
            },
            Kind::NoSubstitutionTemplate => template(NO_SUBSTITUTION_TEMPLATE),
            Kind::TemplateHead => template(TEMPLATE_HEAD),
            Kind::TemplateMiddle => template(TEMPLATE_MIDDLE),
            Kind::TemplateTail => template(TEMPLATE_TAIL),
            Kind::JSXText => collapsed(self.file.slice(start, end)),
            _ => self.file.slice(start, end).to_string(),
        }
    }

    /// Texts of the tokens inside `[start, end)` that `keep` lets through, in source order.
    pub fn within(&self, start: u32, end: u32, keep: impl Fn(&oxc_parser::Token) -> bool, out: &mut Vec<String>) {
        let tokens = self.file.tokens;
        let first = tokens.partition_point(|token| token.start() < start);
        for token in &tokens[first..] {
            if token.start() >= end {
                break;
            }
            if token.kind() == Kind::Eof || !keep(token) {
                continue;
            }
            let text = self.text(token);
            if !text.is_empty() {
                out.push(text);
            }
        }
    }
}
