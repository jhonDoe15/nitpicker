//! The bindings the compiler counts as used beyond plain value references, and the references it does not count.
use crate::typescript::ParsedFile;
use oxc_ast::ast::{Class, Function, IdentifierReference, ImportDeclaration, ImportDeclarationSpecifier};
use oxc_ast::ast::{JSXOpeningElement, JSXOpeningFragment, PropertyDefinition};
use oxc_ast::ast::{TSEnumDeclaration, TSExternalModuleDeclaration, TSGlobalDeclaration, TSMethodSignature};
use oxc_ast::ast::{TSNamespaceDeclaration, TSPropertySignature, VariableDeclaration};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::Semantic;
use oxc_syntax::reference::ReferenceId;
use oxc_syntax::scope::{ScopeFlags, ScopeId};
use oxc_syntax::symbol::SymbolId;
use std::cell::Cell;
use std::collections::HashSet;

/// The bindings the compiler counts as used beyond value references: the `React` that JSX elements and fragments
/// reach, and the names in computed keys of type members, which it reads as values. References in an ambient
/// (`declare`) context are no uses at all.
pub(super) struct Factories<'s, 'a> {
    semantic: &'s Semantic<'a>,
    used: HashSet<SymbolId>,
    ambient_reads: HashSet<ReferenceId>,
    scopes: Vec<ScopeId>,
    in_key: bool,
    ambient: u32,
}

impl<'s, 'a> Factories<'s, 'a> {
    pub(super) fn of(semantic: &'s Semantic<'a>, parsed: &ParsedFile<'a>) -> Self {
        let root = semantic.scoping().root_scope_id();
        let mut factories = Self {
            semantic,
            used: HashSet::new(),
            ambient_reads: HashSet::new(),
            scopes: vec![root],
            in_key: false,
            ambient: 0,
        };
        factories.visit_program(parsed.program);
        factories
    }

    /// Whether the compiler keeps the import: it has no bindings, or a binding has a use outside an ambient context.
    pub(super) fn emits(&self, import: &ImportDeclaration) -> bool {
        let Some(specifiers) = &import.specifiers else { return true };
        if import.import_kind.is_type() {
            return false;
        }
        specifiers.iter().any(|specifier| {
            let local = match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(named) if named.import_kind.is_type() => return false,
                ImportDeclarationSpecifier::ImportSpecifier(named) => &named.local,
                ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => &default.local,
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => &namespace.local,
            };
            let Some(symbol) = local.symbol_id.get() else { return false };
            let scoping = self.semantic.scoping();
            self.used.contains(&symbol)
                || scoping.get_resolved_reference_ids(symbol).iter().any(|id| {
                    let flags = scoping.get_reference(*id).flags();
                    !self.ambient_reads.contains(id) && (flags.is_read() || flags.is_write())
                })
        })
    }

    fn ambient_if(&mut self, declare: bool, walk: impl FnOnce(&mut Self)) {
        self.ambient += u32::from(declare);
        walk(self);
        self.ambient -= u32::from(declare);
    }

    fn reach(&mut self) {
        let Some(&scope) = self.scopes.last() else { return };
        if let Some(symbol) = self.semantic.scoping().find_binding(scope, "React".into()) {
            self.used.insert(symbol);
        }
    }
}

impl<'a> Visit<'a> for Factories<'_, 'a> {
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        self.reach();
        walk::walk_jsx_opening_element(self, it);
    }

    fn visit_ts_property_signature(&mut self, it: &TSPropertySignature<'a>) {
        self.in_key = it.computed;
        self.visit_property_key(&it.key);
        self.in_key = false;
        if let Some(annotation) = &it.type_annotation {
            self.visit_ts_type_annotation(annotation);
        }
    }

    fn visit_ts_method_signature(&mut self, it: &TSMethodSignature<'a>) {
        self.in_key = it.computed;
        self.visit_property_key(&it.key);
        self.in_key = false;
        walk::walk_ts_method_signature(self, it);
    }

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let Some(id) = it.reference_id.get() else { return };
        if self.ambient > 0 {
            self.ambient_reads.insert(id);
        } else if let Some(symbol) = self.semantic.scoping().get_reference(id).symbol_id().filter(|_| self.in_key) {
            self.used.insert(symbol);
        }
    }

    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        self.ambient_if(it.declare, |this| walk::walk_variable_declaration(this, it));
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.ambient_if(it.declare, |this| walk::walk_function(this, it, flags));
    }

    fn visit_class(&mut self, it: &Class<'a>) {
        self.ambient_if(it.declare, |this| walk::walk_class(this, it));
    }

    fn visit_property_definition(&mut self, it: &PropertyDefinition<'a>) {
        self.ambient_if(it.declare, |this| walk::walk_property_definition(this, it));
    }

    fn visit_ts_enum_declaration(&mut self, it: &TSEnumDeclaration<'a>) {
        self.ambient_if(it.declare, |this| walk::walk_ts_enum_declaration(this, it));
    }

    fn visit_ts_namespace_declaration(&mut self, it: &TSNamespaceDeclaration<'a>) {
        self.ambient_if(it.declare, |this| walk::walk_ts_namespace_declaration(this, it));
    }

    fn visit_ts_external_module_declaration(&mut self, it: &TSExternalModuleDeclaration<'a>) {
        self.ambient_if(true, |this| walk::walk_ts_external_module_declaration(this, it));
    }

    fn visit_ts_global_declaration(&mut self, it: &TSGlobalDeclaration<'a>) {
        self.ambient_if(true, |this| walk::walk_ts_global_declaration(this, it));
    }

    fn visit_jsx_opening_fragment(&mut self, _: &JSXOpeningFragment) {
        self.reach();
    }

    fn enter_scope(&mut self, _: ScopeFlags, scope: &Cell<Option<ScopeId>>) {
        let current = self.scopes.last().copied();
        self.scopes.extend(scope.get().or(current));
    }

    fn leave_scope(&mut self) {
        self.scopes.pop();
    }
}
