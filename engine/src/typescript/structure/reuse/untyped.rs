//! The tokens that exist only for the type system, which the untyped view of a definition leaves out.
use super::references::Span;
use crate::typescript::ParsedFile;
use crate::typescript::tree::Tree;
use oxc_ast::AstKind;
use oxc_ast::ast::{BindingPattern, Decorator, Expression, MethodDefinitionKind};
use oxc_parser::{Kind, Token};
use oxc_span::GetSpan;
use std::collections::HashSet;

pub struct TypeOnly {
    /// Erased ranges, by start. They may nest.
    spans: Vec<Span>,
    /// Starts of single erased tokens.
    tokens: HashSet<u32>,
}

struct Scan<'t> {
    tokens: &'t [Token],
    found: TypeOnly,
}

fn is_modifier(kind: Kind) -> bool {
    matches!(kind, Kind::Public | Kind::Private | Kind::Protected | Kind::Readonly | Kind::Abstract | Kind::Override | Kind::Declare)
}

fn is_assertion(expression: &Expression) -> bool {
    matches!(
        expression,
        Expression::TSAsExpression(_) | Expression::TSSatisfiesExpression(_) | Expression::TSTypeAssertion(_) | Expression::TSNonNullExpression(_)
    )
}

impl Scan<'_> {
    fn at(&self, offset: u32) -> usize {
        self.tokens.partition_point(|token| token.start() < offset)
    }
    fn span(&mut self, start: u32, end: u32) {
        if start < end {
            self.found.spans.push((start, end));
        }
    }
    /// Erases the token that starts at or after `offset` when it is one of `kinds`.
    fn next(&mut self, offset: u32, kinds: &[Kind]) {
        if let Some(token) = self.tokens.get(self.at(offset)) {
            if kinds.contains(&token.kind()) {
                self.found.tokens.insert(token.start());
            }
        }
    }
    /// The parentheses around an assignment target that is a cast, which the parser does not keep as a node.
    fn wrapping(&mut self, start: u32, end: u32) {
        let (before, after) = (self.at(start), self.at(end));
        if before == 0 {
            return;
        }
        let (open, close) = (self.tokens[before - 1], self.tokens.get(after).copied());
        if open.kind() == Kind::LParen && close.is_some_and(|close| close.kind() == Kind::RParen) {
            self.found.tokens.insert(open.start());
            self.found.tokens.extend(close.map(|close| close.start()));
        }
    }
    fn separator(&mut self, end: u32) {
        self.next(end, &[Kind::Comma, Kind::Semicolon]);
    }
    fn modifiers(&mut self, start: u32, decorators: &[Decorator], until: u32) {
        let from = decorators.last().map_or(start, |decorator| decorator.span.end.max(start));
        for token in &self.tokens[self.at(from)..] {
            if token.start() >= until {
                break;
            }
            if is_modifier(token.kind()) {
                self.found.tokens.insert(token.start());
            }
        }
    }
    /// The `?` or `!` after a member's key; a computed key ends one `]` earlier than the mark.
    fn mark(&mut self, key_end: u32, computed: bool) {
        let mut index = self.at(key_end);
        if computed && self.tokens.get(index).is_some_and(|token| token.kind() == Kind::RBrack) {
            index += 1;
        }
        if let Some(token) = self.tokens.get(index) {
            if matches!(token.kind(), Kind::Question | Kind::Bang) {
                self.found.tokens.insert(token.start());
            }
        }
    }

    fn node(&mut self, kind: AstKind, start: u32, end: u32) {
        match kind {
            AstKind::TSTypeParameterDeclaration(_)
            | AstKind::TSTypeParameterInstantiation(_)
            | AstKind::TSTypeAnnotation(_)
            | AstKind::TSInterfaceDeclaration(_)
            | AstKind::TSTypeAliasDeclaration(_) => self.span(start, end),
            AstKind::TSAsExpression(cast) => self.span(cast.expression.span().end, end),
            AstKind::TSSatisfiesExpression(cast) => self.span(cast.expression.span().end, end),
            AstKind::TSNonNullExpression(cast) => self.span(cast.expression.span().end, end),
            AstKind::TSTypeAssertion(cast) => self.span(start, cast.expression.span().start),
            AstKind::ParenthesizedExpression(wrapped) if is_assertion(&wrapped.expression) => {
                self.found.tokens.insert(start);
                self.found.tokens.insert(end - 1);
            }
            AstKind::ArrowFunctionExpression(arrow) => {
                let parameters = &arrow.params;
                let bare = parameters.rest.is_none()
                    && parameters.items.len() == 1
                    && matches!(parameters.items[0].pattern, BindingPattern::BindingIdentifier(_))
                    && parameters.items[0].initializer.is_none();
                if bare {
                    self.next(parameters.span.start, &[Kind::LParen]);
                    let last = self.at(parameters.span.end);
                    if last > 0 && self.tokens[last - 1].kind() == Kind::RParen && self.tokens[last - 1].start() > parameters.items[0].span.start {
                        self.found.tokens.insert(self.tokens[last - 1].start());
                    }
                }
            }
            AstKind::TSThisParameter(_) => {
                self.span(start, end);
                self.next(end, &[Kind::Comma]);
            }
            AstKind::TSIndexSignature(_) => {
                self.span(start, end);
                self.separator(end);
            }
            AstKind::PropertyDefinition(property) => {
                if property.declare {
                    self.span(start, end);
                    self.separator(end);
                } else {
                    self.modifiers(start, &property.decorators, property.key.span().start);
                    self.mark(property.key.span().end, property.computed);
                }
            }
            AstKind::MethodDefinition(method) => {
                let signature = method.value.body.is_none() && matches!(method.kind, MethodDefinitionKind::Method | MethodDefinitionKind::Constructor);
                if signature {
                    self.span(start, end);
                    self.separator(end);
                } else {
                    self.modifiers(start, &method.decorators, method.key.span().start);
                    self.mark(method.key.span().end, method.computed);
                }
            }
            AstKind::AccessorProperty(property) => self.modifiers(start, &property.decorators, property.key.span().start),
            AstKind::TSPropertySignature(property) => self.modifiers(start, &[], property.key.span().start),
            AstKind::FormalParameter(parameter) => {
                self.modifiers(start, &parameter.decorators, parameter.pattern.span().start);
                self.next(parameter.pattern.span().end, &[Kind::Question, Kind::Bang]);
            }
            AstKind::VariableDeclarator(declarator) => self.next(declarator.id.span().end, &[Kind::Bang]),
            AstKind::VariableDeclaration(declaration) if declaration.declare => self.span(start, end),
            AstKind::Class(class) => {
                let from = self.at(class.decorators.last().map_or(start, |decorator| decorator.span.end.max(start)));
                for token in &self.tokens[from..] {
                    if token.kind() == Kind::Class || token.start() >= end {
                        break;
                    }
                    if is_modifier(token.kind()) {
                        self.found.tokens.insert(token.start());
                    }
                }
                if let Some(first) = class.implements.first() {
                    let keyword = self.at(first.span.start);
                    if keyword > 0 && self.tokens[keyword - 1].kind() == Kind::Implements {
                        self.span(self.tokens[keyword - 1].start(), class.body.span.start);
                    }
                }
            }
            _ => {}
        }
    }
}

impl TypeOnly {
    pub fn of(file: &ParsedFile, tree: &Tree) -> TypeOnly {
        let mut scan = Scan { tokens: file.tokens, found: TypeOnly { spans: Vec::new(), tokens: HashSet::new() } };
        for (index, node) in tree.nodes.iter().enumerate() {
            scan.node(node.kind, node.start, node.end);
            let cast = matches!(
                node.kind,
                AstKind::TSAsExpression(_) | AstKind::TSSatisfiesExpression(_) | AstKind::TSNonNullExpression(_) | AstKind::TSTypeAssertion(_)
            );
            let target = match tree.parent(index as u32).map(|parent| tree.kind(parent)) {
                Some(AstKind::AssignmentExpression(assignment)) => assignment.left.span().start == node.start,
                Some(AstKind::UpdateExpression(_)) => true,
                _ => false,
            };
            if cast && target {
                scan.wrapping(node.start, node.end);
            }
        }
        scan.found.spans.sort_unstable();
        scan.found
    }

    /// The erased ranges inside `part`, merged. A range that reaches past the part belongs to an enclosing
    /// declaration, whose parts are read on their own.
    pub fn inside(&self, part: Span) -> Vec<Span> {
        let first = self.spans.partition_point(|span| span.0 < part.0);
        let mut merged: Vec<Span> = Vec::new();
        for span in &self.spans[first..] {
            if span.0 >= part.1 {
                break;
            }
            if span.1 > part.1 {
                continue;
            }
            match merged.last_mut() {
                Some(last) if span.0 < last.1 => last.1 = last.1.max(span.1),
                _ => merged.push(*span),
            }
        }
        merged
    }

    pub fn token(&self, start: u32) -> bool {
        self.tokens.contains(&start)
    }
}
