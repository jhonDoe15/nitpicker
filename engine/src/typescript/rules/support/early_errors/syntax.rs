//! Syntax oxc accepts that typescript-estree refuses: its own checks on decorators, modifiers and enum names, and
//! the TypeScript scanner's legacy octal and decimal forms. A file with any of them is `!parse`, as ESLint cannot
//! lint it either.
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;
use std::collections::HashSet;

pub fn refused(program: &Program, text: &str, path: &str) -> bool {
    let module = !path.to_ascii_lowercase().ends_with(".cjs") || program.body.iter().any(Statement::is_module_declaration);
    let mut check = Check { text, module, refused: false, declarations: Vec::new(), decorable: HashSet::new(), nested: Vec::new(), skipped: HashSet::new() };
    check.visit_program(program);
    check.refused
}

struct Check<'t> {
    text: &'t str,
    module: bool,
    refused: bool,
    /// For each class being walked, whether it is a class declaration.
    declarations: Vec<bool>,
    /// Parameters of method implementations of class declarations, which may be decorated.
    decorable: HashSet<u32>,
    /// Functions, static blocks and field values being walked: code no longer at the top level of the module.
    nested: Vec<Span>,
    /// Identifiers and strings exempt from a check: shorthand property values and JSX attribute values.
    skipped: HashSet<u32>,
}

impl Check<'_> {
    fn at_top(&self, span: Span) -> bool {
        !self.nested.iter().any(|nested| nested.start <= span.start && span.end <= nested.end)
    }

    fn top_level_await(&mut self, name: &str, span: Span) {
        self.refused |= self.module && name == "await" && !self.skipped.contains(&span.start) && self.at_top(span);
    }

    /// The words written before a class member's key, after its decorators: its modifiers.
    fn modifiers(&self, decorators: &[Decorator], span: Span, key: &PropertyKey) -> Vec<&str> {
        let start = decorators.last().map_or(span.start, |decorator| decorator.span.end) as usize;
        let written = self.text.get(start..key.span().start as usize).unwrap_or_default();
        let mut words = Vec::new();
        let mut rest = written;
        while let Some(first) = rest.chars().next() {
            if rest.starts_with("//") {
                rest = rest.find('\n').map_or("", |end| &rest[end..]);
            } else if rest.starts_with("/*") {
                rest = rest[2..].find("*/").map_or("", |end| &rest[end + 4..]);
            } else if first.is_alphabetic() {
                let end = rest.find(|c: char| !c.is_alphanumeric()).unwrap_or(rest.len());
                words.push(&rest[..end]);
                rest = &rest[end..];
            } else {
                rest = &rest[first.len_utf8()..];
            }
        }
        words
    }

    fn nest(&mut self, span: Span, walk: impl FnOnce(&mut Self)) {
        self.nested.push(span);
        walk(self);
        self.nested.pop();
    }
}

/// A legacy octal or leading-zero decimal: `010`, `08`, `08.5`.
fn leading_zero(written: &str) -> bool {
    let bytes = written.as_bytes();
    bytes.len() > 1 && bytes[0] == b'0' && bytes[1].is_ascii_digit()
}

/// An octal escape or `\8` / `\9` in a string literal as written.
fn octal_escape(written: &str) -> bool {
    let bytes = written.as_bytes();
    let mut at = 0;
    while at + 1 < bytes.len() {
        if bytes[at] == b'\\' {
            let next = bytes[at + 1];
            if (b'1'..=b'9').contains(&next) || next == b'0' && bytes.get(at + 2).is_some_and(u8::is_ascii_digit) {
                return true;
            }
            at += 2;
        } else {
            at += 1;
        }
    }
    false
}

impl<'a> Visit<'a> for Check<'_> {
    fn visit_class(&mut self, it: &Class<'a>) {
        self.declarations.push(it.is_declaration());
        walk::walk_class(self, it);
        self.declarations.pop();
    }

    fn visit_method_definition(&mut self, it: &MethodDefinition<'a>) {
        let modifiers = self.modifiers(&it.decorators, it.span, &it.key);
        self.refused |= modifiers.iter().any(|word| matches!(*word, "default" | "readonly" | "in" | "out"));
        self.refused |= it.kind == MethodDefinitionKind::Constructor && !it.decorators.is_empty();
        let implemented = it.kind != MethodDefinitionKind::Get && it.value.body.is_some();
        if implemented && self.declarations.last() == Some(&true) {
            let parameters = &it.value.params;
            self.decorable.extend(parameters.items.iter().map(|parameter| parameter.span.start));
            self.decorable.extend(parameters.rest.iter().map(|rest| rest.span.start));
        }
        walk::walk_method_definition(self, it);
    }

    fn visit_property_definition(&mut self, it: &PropertyDefinition<'a>) {
        self.refused |= self.modifiers(&it.decorators, it.span, &it.key).contains(&"default");
        match &it.value {
            Some(value) => self.nest(value.span(), |check| walk::walk_property_definition(check, it)),
            None => walk::walk_property_definition(self, it),
        }
    }

    fn visit_accessor_property(&mut self, it: &AccessorProperty<'a>) {
        self.refused |= self.modifiers(&it.decorators, it.span, &it.key).contains(&"default");
        match &it.value {
            Some(value) => self.nest(value.span(), |check| walk::walk_accessor_property(check, it)),
            None => walk::walk_accessor_property(self, it),
        }
    }

    fn visit_formal_parameter(&mut self, it: &FormalParameter<'a>) {
        self.refused |= !it.decorators.is_empty() && !self.decorable.contains(&it.span.start);
        walk::walk_formal_parameter(self, it);
    }

    fn visit_formal_parameter_rest(&mut self, it: &FormalParameterRest<'a>) {
        self.refused |= !it.decorators.is_empty() && !self.decorable.contains(&it.span.start);
        walk::walk_formal_parameter_rest(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.refused |= it.declare && it.r#async;
        self.nest(it.span, |check| walk::walk_function(check, it, flags));
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.nest(it.span, |check| walk::walk_arrow_function_expression(check, it));
    }

    fn visit_static_block(&mut self, it: &StaticBlock<'a>) {
        self.nest(it.span, |check| walk::walk_static_block(check, it));
    }

    fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
        if it.shorthand {
            self.skipped.insert(it.value.span().start);
        }
        walk::walk_object_property(self, it);
    }

    fn visit_jsx_attribute(&mut self, it: &JSXAttribute<'a>) {
        if let Some(JSXAttributeValue::StringLiteral(value)) = &it.value {
            self.skipped.insert(value.span.start);
        }
        walk::walk_jsx_attribute(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.top_level_await(&it.name, it.span);
    }

    fn visit_label_identifier(&mut self, it: &LabelIdentifier<'a>) {
        self.top_level_await(&it.name, it.span);
    }

    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        self.refused |= matches!(&it.left, ForStatementLeft::VariableDeclaration(declaration) if declaration.declarations.iter().any(|declarator| declarator.init.is_some()));
        walk::walk_for_in_statement(self, it);
    }

    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        self.refused |= !it.r#await && matches!(&it.left, ForStatementLeft::AssignmentTargetIdentifier(name) if name.name == "await");
        walk::walk_for_of_statement(self, it);
    }

    fn visit_ts_enum_member(&mut self, it: &TSEnumMember<'a>) {
        self.refused |= matches!(it.id, TSEnumMemberName::ComputedString(_) | TSEnumMemberName::ComputedTemplateString(_));
        walk::walk_ts_enum_member(self, it);
    }

    fn visit_numeric_literal(&mut self, it: &NumericLiteral<'a>) {
        self.refused |= leading_zero(it.span.source_text(self.text));
    }

    fn visit_string_literal(&mut self, it: &StringLiteral<'a>) {
        self.refused |= !self.skipped.contains(&it.span.start) && octal_escape(it.span.source_text(self.text));
    }
}
