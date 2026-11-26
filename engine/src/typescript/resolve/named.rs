//! The modules a file names: imports, re-exports, `require` and `import()` with a literal specifier.
use oxc_ast::ast::{Argument, CallExpression, ExportAllDeclaration, ExportFromDeclaration, Expression};
use oxc_ast::ast::{ImportDeclaration, ImportExpression, TSImportEqualsDeclaration, TSModuleReference, TemplateLiteral};
use oxc_ast_visit::{Visit, walk};
use std::path::Path;

struct Named(Vec<String>);

impl Named {
    fn text(&mut self, template: &TemplateLiteral) {
        if let ([only], []) = (template.quasis.as_slice(), template.expressions.as_slice()) {
            self.0.extend(only.value.cooked.and_then(|cooked| cooked.as_str()).map(String::from));
        }
    }
}

impl<'a> Visit<'a> for Named {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_import_declaration(self, it);
    }

    fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_export_from_declaration(self, it);
    }

    fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
        self.0.extend(it.source.value.as_str().map(String::from));
        walk::walk_export_all_declaration(self, it);
    }

    fn visit_ts_import_equals_declaration(&mut self, it: &TSImportEqualsDeclaration<'a>) {
        if let TSModuleReference::ExternalModuleReference(reference) = &it.module_reference {
            self.0.extend(reference.expression.value.as_str().map(String::from));
        }
        walk::walk_ts_import_equals_declaration(self, it);
    }

    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        match &it.source {
            Expression::StringLiteral(literal) => self.0.extend(literal.value.as_str().map(String::from)),
            Expression::TemplateLiteral(template) => self.text(template),
            _ => {}
        }
        walk::walk_import_expression(self, it);
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if matches!(&it.callee, Expression::Identifier(callee) if callee.name == "require") {
            match it.arguments.first() {
                Some(Argument::StringLiteral(literal)) => self.0.extend(literal.value.as_str().map(String::from)),
                Some(Argument::TemplateLiteral(template)) => self.text(template),
                _ => {}
            }
        }
        walk::walk_call_expression(self, it);
    }
}

pub(super) fn scanned(file: &Path) -> Vec<String> {
    let path = file.to_string_lossy();
    let known = file.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| crate::typescript::EXTENSIONS.contains(&extension));
    let Some(text) = known.then(|| std::fs::read_to_string(file).ok()).flatten() else { return Vec::new() };
    crate::typescript::with_parsed(&path, &text, |parsed| {
        let mut named = Named(Vec::new());
        if !parsed.panicked {
            named.visit_program(parsed.program);
        }
        named.0
    })
}
