//! The pieces of a declaration that make up its text: type parameters, parameters, heritage, members, type and body.
use super::references::Span;
use oxc_ast::ast::{
    ArrowFunctionExpression, Class, FormalParameters, Function, TSEnumDeclaration, TSInterfaceDeclaration, TSThisParameter, TSTypeAliasDeclaration,
    TSTypeAnnotation, TSTypeParameterDeclaration,
};
use oxc_parser::{Kind, Token};
use oxc_span::GetSpan;

#[derive(Default)]
pub struct Parts {
    pub typed: Vec<Span>,
    /// The typed parts without the ones that are a type by position.
    pub untyped: Vec<Span>,
}

fn span_of(node: &impl GetSpan) -> Span {
    let span = node.span();
    (span.start, span.end)
}

impl Parts {
    fn both(&mut self, span: Span) {
        if span.0 < span.1 {
            self.typed.push(span);
            self.untyped.push(span);
        }
    }
    fn type_parameters(&mut self, list: Option<&TSTypeParameterDeclaration>) {
        self.typed.extend(list.into_iter().flat_map(|list| list.params.iter().map(|parameter| span_of(parameter))));
    }
    pub fn annotation(&mut self, annotation: Option<&TSTypeAnnotation>) {
        self.typed.extend(annotation.map(|annotation| span_of(&annotation.type_annotation)));
    }
    fn parameters(&mut self, this: Option<&TSThisParameter>, parameters: &FormalParameters) {
        if let Some(this) = this {
            self.both(span_of(this));
        }
        for parameter in &parameters.items {
            self.both(span_of(parameter));
        }
        if let Some(rest) = &parameters.rest {
            self.both(span_of(&**rest));
        }
    }

    pub fn function(&mut self, function: &Function) {
        self.type_parameters(function.type_parameters.as_deref());
        self.parameters(function.this_param.as_deref(), &function.params);
        self.annotation(function.return_type.as_deref());
        if let Some(body) = &function.body {
            self.both(span_of(&**body));
        }
    }

    pub fn arrow(&mut self, arrow: &ArrowFunctionExpression) {
        self.type_parameters(arrow.type_parameters.as_deref());
        self.parameters(None, &arrow.params);
        self.annotation(arrow.return_type.as_deref());
        self.both(span_of(&arrow.body));
    }

    /// Everything between the declaration's head and its body is heritage clauses.
    fn heritage(&mut self, tokens: &[Token], head_end: u32, body_start: u32) {
        let first = tokens.partition_point(|token| token.start() < head_end);
        if let Some(token) = tokens.get(first) {
            self.both((token.start(), body_start));
        }
    }

    pub fn class(&mut self, tokens: &[Token], class: &Class) {
        self.type_parameters(class.type_parameters.as_deref());
        let keyword = tokens[tokens.partition_point(|token| token.start() < class.span.start)..]
            .iter()
            .find(|token| token.kind() == Kind::Class)
            .map_or(class.span.start, Token::end);
        let head_end = class.type_parameters.as_ref().map(|list| list.span.end).or(class.id.as_ref().map(|id| id.span.end)).unwrap_or(keyword);
        self.heritage(tokens, head_end, class.body.span.start);
        self.both((class.body.span.start + 1, class.body.span.end.saturating_sub(1)));
    }

    pub fn interface(&mut self, tokens: &[Token], interface: &TSInterfaceDeclaration) {
        self.type_parameters(interface.type_parameters.as_deref());
        let head_end = interface.type_parameters.as_ref().map_or(interface.id.span.end, |list| list.span.end);
        self.heritage(tokens, head_end, interface.body.span.start);
        self.both((interface.body.span.start + 1, interface.body.span.end.saturating_sub(1)));
    }

    pub fn enumeration(&mut self, declaration: &TSEnumDeclaration) {
        for member in &declaration.body.members {
            self.both(span_of(member));
        }
    }

    pub fn alias(&mut self, alias: &TSTypeAliasDeclaration) {
        self.type_parameters(alias.type_parameters.as_deref());
        self.typed.push(span_of(&alias.type_annotation));
    }
}
