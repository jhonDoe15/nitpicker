//! How PMD tells test classes and test methods of JUnit 3, 4, 5 and TestNG apart.
use super::ctx::Ctx;

const JUNIT5_TESTS: &[&str] = &[
    "org.junit.jupiter.api.Test",
    "org.junit.jupiter.api.RepeatedTest",
    "org.junit.jupiter.api.TestFactory",
    "org.junit.jupiter.api.TestTemplate",
    "org.junit.jupiter.params.ParameterizedTest",
];

impl Ctx<'_, '_, '_> {
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

    fn is_junit_method(&self, method: u32) -> bool {
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
}
