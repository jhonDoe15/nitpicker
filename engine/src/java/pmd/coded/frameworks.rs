//! How PMD tells test classes and test methods apart, and what it still knows of a call it cannot pin down.
use super::ctx::Ctx;
use crate::java::types::model::Type;

const JUNIT5_TESTS: &[&str] = &[
    "org.junit.jupiter.api.Test",
    "org.junit.jupiter.api.RepeatedTest",
    "org.junit.jupiter.api.TestFactory",
    "org.junit.jupiter.api.TestTemplate",
    "org.junit.jupiter.params.ParameterizedTest",
];

impl Ctx<'_, '_, '_> {
    pub fn is_expression(&self, id: u32) -> bool {
        super::message::EXPRESSIONS.contains(&self.name(id))
    }

    /// PMD's `JavaAstUtils.getTopLevelExpr`.
    pub fn top_level_expression(&self, expression: u32) -> u32 {
        let mut top = expression;
        while let Some(parent) = self.parent(top) {
            let argument_list = self.is(parent, "ArgumentList")
                && self.parent(parent).is_some_and(|call| self.is_expression(call));
            if !self.is_expression(parent) && !argument_list {
                break;
            }
            top = parent;
        }
        top
    }

    /// The formal parameter types of the method or constructor a call resolves to.
    pub fn formals(&self, call: u32) -> Option<Vec<Type>> {
        self.resolved(call).map(|(_, formals)| formals)
    }

    pub fn resolved(&self, call: u32) -> Option<(crate::java::types::expr::Call, Vec<Type>)> {
        let source = self.tree.nodes[call as usize].source?;
        self.machine.resolver.call_formals(source)
    }

    /// PMD's `isAnnotationPresent`: an annotation of the declaration is of the type or a subtype.
    pub fn annotation_present(&self, owner: u32, name: &str) -> bool {
        self.annotations(owner)
            .into_iter()
            .any(|annotation| self.type_is(annotation, name))
    }

    pub fn is_void(&self, method: u32) -> bool {
        self.kid(method, "VoidType").is_some()
    }

    pub fn is_public(&self, owner: u32) -> bool {
        self.text(owner, "Visibility") == "public"
    }

    pub fn arity(&self, method: u32) -> i64 {
        self.whole(method, "Arity").unwrap_or(0)
    }

    pub fn enclosing_type(&self, id: u32) -> Option<u32> {
        self.enclosing(id, super::ctx::TYPE_DECLARATIONS)
    }

    pub fn is_junit3_class(&self, declaration: u32) -> bool {
        self.flag(declaration, "RegularClass")
            && !self.flag(declaration, "Nested")
            && !self.flag(declaration, "Abstract")
            && self.type_is(declaration, "junit.framework.TestCase")
    }

    fn is_junit3_method(&self, method: u32) -> bool {
        self.enclosing_type(method)
            .is_some_and(|owner| self.is_junit3_class(owner))
            && self.is_void(method)
            && self.is_public(method)
            && self.text(method, "Name").starts_with("test")
    }

    fn is_junit5_method(&self, method: u32) -> bool {
        self.annotations(method)
            .into_iter()
            .any(|annotation| JUNIT5_TESTS.iter().any(|name| self.type_is_exactly(annotation, name)))
    }

    pub fn is_junit_method(&self, method: u32) -> bool {
        if self.has_modifier(method, "static") || self.kid(method, "Block").is_none() {
            return false;
        }
        self.is_junit5_method(method)
            || (self.annotation_present(method, "org.junit.Test") && self.is_public(method))
            || self.is_junit3_method(method)
    }

    pub fn is_test_method(&self, method: u32) -> bool {
        self.is_junit_method(method) || self.annotation_present(method, "org.testng.annotations.Test")
    }

    /// The type of an expression, where a call whose arguments leave the overload open still has the class and
    /// result that every candidate shares, as PMD keeps them.
    pub fn loose_type(&self, id: u32) -> Option<Type> {
        self.type_of(id)
            .or_else(|| self.loose_call(id).and_then(|(_, returns)| returns))
    }

    pub(super) fn loose_call(&self, call: u32) -> Option<(String, Option<Type>)> {
        let on = self.qualifier(call).filter(|_| self.is(call, "MethodCall"))?;
        let owner = self.loose_type(on)?.erased().name();
        let arity = self.arguments(call).len();
        let resolver = self.machine.resolver;
        let (index, package) = (resolver.index, &resolver.scope.package);
        let candidates: Vec<_> = index
            .methods(&owner, &self.method_name(call))
            .into_iter()
            .filter(|(class, method)| !method.package_private || class.package == *package)
            .filter(|(_, method)| {
                method.parameters.len() == arity || (method.varargs && arity + 1 >= method.parameters.len())
            })
            .collect();
        let (first, _) = candidates.first()?;
        if candidates.iter().any(|(class, _)| class.name != first.name) {
            return None;
        }
        let returns = candidates[0].1.returns.clone();
        let shared = candidates.iter().all(|(_, method)| method.returns == returns);
        Some((first.name.clone(), shared.then_some(returns)))
    }
}
