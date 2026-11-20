//! How the TypeScript compiler's tree would describe an oxc node: which nodes are function-like, where a
//! declaration starts and ends, and how deep a node sits. The Node analyzer is written against the compiler's
//! tree, so its answers depend on these.
use crate::typescript::ParsedFile;
use crate::typescript::tree::Tree;
use oxc_ast::AstKind;
use oxc_ast::ast::*;
use oxc_span::{GetSpan, Span};

pub struct Shape<'t, 'a> {
    pub file: &'t ParsedFile<'a>,
    pub tree: &'t Tree<'a>,
}

#[derive(Clone, Copy)]
pub enum Callable<'a> {
    Function(&'a Function<'a>),
    Arrow(&'a ArrowFunctionExpression<'a>),
}

pub fn is_method_property(property: &ObjectProperty) -> bool {
    property.method || property.kind != PropertyKind::Init
}

pub fn is_wrapper(kind: AstKind) -> bool {
    matches!(
        kind,
        AstKind::ParenthesizedExpression(_)
            | AstKind::TSAsExpression(_)
            | AstKind::TSSatisfiesExpression(_)
            | AstKind::TSNonNullExpression(_)
            | AstKind::TSTypeAssertion(_)
    )
}

/// The expression under any parentheses, `as`, `satisfies`, `!` and `<T>` wrappers.
pub fn inner<'e, 'a>(expression: &'e Expression<'a>) -> &'e Expression<'a> {
    let mut current = expression;
    loop {
        current = match current {
            Expression::ParenthesizedExpression(wrapper) => &wrapper.expression,
            Expression::TSAsExpression(wrapper) => &wrapper.expression,
            Expression::TSSatisfiesExpression(wrapper) => &wrapper.expression,
            Expression::TSNonNullExpression(wrapper) => &wrapper.expression,
            Expression::TSTypeAssertion(wrapper) => &wrapper.expression,
            _ => return current,
        };
    }
}

impl<'t, 'a> Shape<'t, 'a> {
    pub fn kind(&self, index: u32) -> AstKind<'a> {
        self.tree.kind(index)
    }
    pub fn parent_kind(&self, index: u32) -> Option<AstKind<'a>> {
        self.tree.parent(index).map(|parent| self.tree.kind(parent))
    }
    pub fn text(&self, span: Span) -> &'a str {
        self.file.slice(span.start, span.end)
    }

    /// A function declaration or expression, arrow, method, constructor or accessor of the compiler's tree.
    pub fn function_like(&self, index: u32) -> bool {
        match self.kind(index) {
            AstKind::ArrowFunctionExpression(_) | AstKind::MethodDefinition(_) => true,
            AstKind::TSMethodSignature(signature) => signature.kind != TSMethodSignatureKind::Method,
            AstKind::ObjectProperty(property) => is_method_property(property),
            AstKind::Function(function) => match self.parent_kind(index) {
                Some(AstKind::MethodDefinition(_)) => false,
                Some(AstKind::ObjectProperty(property)) => {
                    !(is_method_property(property) && property.value.span() == function.span)
                }
                _ => true,
            },
            _ => false,
        }
    }

    /// The function or arrow a function-like node stands for, and that node's index.
    pub fn callable(&self, index: u32) -> Option<(Callable<'a>, u32)> {
        match self.kind(index) {
            AstKind::ArrowFunctionExpression(arrow) => Some((Callable::Arrow(arrow), index)),
            AstKind::Function(function) => Some((Callable::Function(function), index)),
            AstKind::MethodDefinition(_) | AstKind::ObjectProperty(_) => {
                let value = self.tree.children(index).filter(|child| matches!(self.kind(*child), AstKind::Function(_))).last()?;
                match self.kind(value) {
                    AstKind::Function(function) => Some((Callable::Function(function), value)),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    pub fn parameters(&self, index: u32) -> u32 {
        match self.callable(index) {
            Some((Callable::Function(function), _)) => {
                function.params.items.len() as u32 + u32::from(function.params.rest.is_some()) + u32::from(function.this_param.is_some())
            }
            Some((Callable::Arrow(arrow), _)) => arrow.params.items.len() as u32 + u32::from(arrow.params.rest.is_some()),
            None => match self.kind(index) {
                AstKind::TSMethodSignature(signature) => {
                    signature.params.items.len() as u32 + u32::from(signature.params.rest.is_some()) + u32::from(signature.this_param.is_some())
                }
                _ => 0,
            },
        }
    }

    /// The node of the body: a block, or the expression of an arrow.
    pub fn body(&self, index: u32) -> Option<u32> {
        let (callable, at) = self.callable(index)?;
        let last = self.tree.children(at).last()?;
        match callable {
            Callable::Function(function) => (function.body.is_some() && matches!(self.kind(last), AstKind::FunctionBody(_))).then_some(last),
            Callable::Arrow(_) => Some(last),
        }
    }

    fn expression_body(&self, index: u32) -> Option<u32> {
        match self.kind(index) {
            AstKind::ArrowFunctionExpression(arrow) if !matches!(arrow.body, ArrowFunctionBody::FunctionBody(_)) => self.tree.children(index).last(),
            _ => None,
        }
    }

    fn is_anonymous_function_expression(&self, index: u32) -> bool {
        match self.kind(index) {
            AstKind::ArrowFunctionExpression(_) => true,
            AstKind::Function(function) => function.r#type == FunctionType::FunctionExpression && function.id.is_none() && self.function_like(index),
            _ => false,
        }
    }

    /// The outermost wrapper around a node.
    pub fn unwrapped(&self, index: u32) -> u32 {
        let mut top = index;
        while let Some(parent) = self.tree.parent(top) {
            if !is_wrapper(self.kind(parent)) {
                break;
            }
            top = parent;
        }
        top
    }

    /// `b => c` in `a => b => c`: the analyzer folds it into the outer arrow.
    pub fn curried_inner(&self, index: u32) -> bool {
        if !self.is_anonymous_function_expression(index) {
            return false;
        }
        let top = self.unwrapped(index);
        self.tree.parent(top).is_some_and(|outer| self.expression_body(outer) == Some(top))
    }

    /// The arrow or function expression an arrow returns directly.
    pub fn curried_body(&self, index: u32) -> Option<u32> {
        let mut body = self.expression_body(index)?;
        while is_wrapper(self.kind(body)) {
            let expression = match self.kind(body) {
                AstKind::ParenthesizedExpression(wrapper) => wrapper.expression.span(),
                AstKind::TSAsExpression(wrapper) => wrapper.expression.span(),
                AstKind::TSSatisfiesExpression(wrapper) => wrapper.expression.span(),
                AstKind::TSNonNullExpression(wrapper) => wrapper.expression.span(),
                AstKind::TSTypeAssertion(wrapper) => wrapper.expression.span(),
                _ => return None,
            };
            body = self.tree.children(body).filter(|child| self.tree.is_span(*child, expression)).last()?;
        }
        self.is_anonymous_function_expression(body).then_some(body)
    }

    fn next_significant(&self, mut at: usize) -> Option<(usize, u8)> {
        let bytes = self.file.text.as_bytes();
        while at < bytes.len() {
            match bytes[at] {
                b' ' | b'\t' | b'\n' | b'\r' => at += 1,
                b'/' if bytes.get(at + 1) == Some(&b'/') => {
                    while at < bytes.len() && bytes[at] != b'\n' {
                        at += 1;
                    }
                }
                b'/' if bytes.get(at + 1) == Some(&b'*') => {
                    at += 2;
                    while at + 1 < bytes.len() && !(bytes[at] == b'*' && bytes[at + 1] == b'/') {
                        at += 1;
                    }
                    at += 2;
                }
                byte => return Some((at, byte)),
            }
        }
        None
    }

    /// The end with the `;` the compiler makes part of a declaration that has no body.
    pub fn with_semicolon(&self, end: u32) -> u32 {
        if end > 0 && self.file.text.as_bytes()[end as usize - 1] == b';' {
            return end;
        }
        match self.next_significant(end as usize) {
            Some((at, b';')) => at as u32 + 1,
            _ => end,
        }
    }

    fn decorated_start(&self, start: u32, decorators: &[Decorator]) -> u32 {
        decorators.iter().map(|decorator| decorator.span.start).fold(start, u32::min)
    }

    /// Where the compiler's node starts: at `export`, a decorator or a modifier when there is one.
    pub fn start(&self, index: u32) -> u32 {
        let node = &self.tree.nodes[index as usize];
        let mut start = node.start;
        match node.kind {
            AstKind::Class(class) => start = self.decorated_start(start, &class.decorators),
            AstKind::MethodDefinition(method) => start = self.decorated_start(start, &method.decorators),
            _ => {}
        }
        let declared = match node.kind {
            AstKind::Class(class) => class.r#type == ClassType::ClassDeclaration,
            AstKind::Function(function) => matches!(function.r#type, FunctionType::FunctionDeclaration | FunctionType::TSDeclareFunction),
            _ => false,
        };
        if declared {
            if let Some(parent) = self.tree.parent(index) {
                if matches!(self.kind(parent), AstKind::ExportDeclaration(_) | AstKind::ExportDefaultDeclaration(_)) {
                    start = start.min(self.tree.nodes[parent as usize].start);
                }
            }
        }
        start
    }

    pub fn end(&self, index: u32) -> u32 {
        let node = &self.tree.nodes[index as usize];
        let bodiless = match node.kind {
            AstKind::Function(function) => function.body.is_none(),
            AstKind::MethodDefinition(method) => method.value.body.is_none(),
            _ => false,
        };
        if bodiless { self.with_semicolon(node.end) } else { node.end }
    }

    pub fn key_text(&self, key: &PropertyKey<'a>, computed: bool) -> String {
        let span = key.span();
        if computed {
            let text = self.file.text;
            let open = text[..span.start as usize].rfind('[').unwrap_or(span.start as usize);
            let close = text[span.end as usize..].find(']').map_or(span.end as usize, |at| span.end as usize + at + 1);
            return text[open..close].to_string();
        }
        match key {
            PropertyKey::StringLiteral(literal) => self.file.halves.string(literal.value),
            _ => self.text(span).to_string(),
        }
    }

    /// The name a function, class or object literal takes from what it is assigned to.
    pub fn binding_name(&self, index: u32) -> Option<String> {
        let declared = match self.kind(index) {
            AstKind::Class(class) => class.r#type == ClassType::ClassDeclaration,
            AstKind::Function(function) => function.r#type != FunctionType::FunctionExpression,
            _ => false,
        };
        if declared {
            return None;
        }
        let top = self.unwrapped(index);
        let parent = self.tree.parent(top)?;
        let top_node = &self.tree.nodes[top as usize];
        let is = |span: Span| span.start == top_node.start && span.end == top_node.end;
        match self.kind(parent) {
            AstKind::VariableDeclarator(declarator) => {
                declarator.init.as_ref().is_some_and(|init| is(init.span())).then(|| self.text(declarator.id.span()).to_string())
            }
            AstKind::ObjectProperty(property) => {
                (!is_method_property(property) && !property.shorthand && is(property.value.span()) && top_node.start >= property.key.span().end)
                    .then(|| self.key_text(&property.key, property.computed))
            }
            AstKind::PropertyDefinition(property) => (property.value.as_ref().is_some_and(|value| is(value.span()))
                && top_node.start >= property.key.span().end)
                .then(|| self.key_text(&property.key, property.computed)),
            AstKind::AccessorProperty(property) => (property.value.as_ref().is_some_and(|value| is(value.span()))
                && top_node.start >= property.key.span().end)
                .then(|| self.key_text(&property.key, property.computed)),
            AstKind::AssignmentExpression(assignment) => (assignment.operator == AssignmentOperator::Assign && is(assignment.right.span()))
                .then(|| self.text(assignment.left.span()).to_string()),
            AstKind::ExportDefaultDeclaration(_) | AstKind::TSExportAssignment(_) => Some("default".to_string()),
            _ => None,
        }
    }

    /// How many compiler nodes this oxc node adds on the way down from its parent.
    pub fn levels(&self, index: u32) -> u32 {
        let Some(parent_index) = self.tree.parent(index) else { return 0 };
        let node = &self.tree.nodes[index as usize];
        let is = |span: Span| span.start == node.start && span.end == node.end;
        let kind = node.kind;
        let parent = self.kind(parent_index);
        let own = match kind {
            AstKind::Function(_) => u32::from(self.function_like(index)),
            AstKind::FormalParameters(_)
            | AstKind::ClassBody(_)
            | AstKind::TSEnumBody(_)
            | AstKind::TSInterfaceBody(_)
            | AstKind::TSTypeAnnotation(_)
            | AstKind::ChainExpression(_)
            | AstKind::SequenceExpression(_)
            | AstKind::ExportDeclaration(_) => 0,
            AstKind::VariableDeclaration(_) => {
                if matches!(parent, AstKind::ForStatement(_) | AstKind::ForInStatement(_) | AstKind::ForOfStatement(_)) { 1 } else { 2 }
            }
            AstKind::ExportDefaultDeclaration(export) => match export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(_)
                | ExportDefaultDeclarationKind::ClassDeclaration(_)
                | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => 0,
                _ => 1,
            },
            AstKind::BindingRestElement(_) => u32::from(!matches!(parent, AstKind::FormalParameterRest(_))),
            AstKind::AssignmentPattern(_) => u32::from(!matches!(parent, AstKind::BindingProperty(_))),
            AstKind::JSXOpeningElement(_) => match parent {
                AstKind::JSXElement(element) if element.closing_element.is_none() => 0,
                _ => 1,
            },
            _ => 1,
        };
        let between = match parent {
            AstKind::TemplateLiteral(_) => u32::from(!matches!(kind, AstKind::TemplateElement(_))),
            AstKind::Class(class) => match &class.heritage {
                Some(heritage) if is(heritage.expression.span()) && !matches!(kind, AstKind::ClassBody(_)) => 2,
                _ => 0,
            },
            AstKind::SwitchStatement(_) => u32::from(matches!(kind, AstKind::SwitchCase(_))),
            AstKind::JSXOpeningElement(_) => u32::from(matches!(kind, AstKind::JSXAttribute(_) | AstKind::JSXSpreadAttribute(_))),
            AstKind::ArrayPattern(_) => u32::from(!matches!(kind, AstKind::AssignmentPattern(_) | AstKind::BindingRestElement(_))),
            AstKind::SequenceExpression(sequence) => {
                let count = sequence.expressions.len() as u32;
                let position = sequence.expressions.iter().position(|expression| is(expression.span())).unwrap_or(0) as u32;
                if position == 0 { count.saturating_sub(1) } else { count - position }
            }
            AstKind::StaticBlock(_) => 1,
            AstKind::MethodDefinition(method) => u32::from(method.computed && is(method.key.span())),
            AstKind::PropertyDefinition(property) => u32::from(property.computed && is(property.key.span())),
            AstKind::AccessorProperty(property) => u32::from(property.computed && is(property.key.span())),
            AstKind::ObjectProperty(property) => u32::from(property.computed && is(property.key.span()) && node.end <= property.value.span().start),
            _ => 0,
        };
        own + between
    }
}
