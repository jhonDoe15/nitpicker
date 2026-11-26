//! Whether a node sits in code that tests run, the way `ASTHelpers.isJUnitTestCode` and `isTestNgTestCode` decide.
use super::Context;
use super::hierarchy::{declared_method, super_methods};
use crate::engine::source::parent;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

fn annotated_with(context: &Context, declaration: Node, prefix: &str) -> bool {
    context.resolver.annotation_names(declaration).iter().any(|name| name.starts_with(prefix))
}

fn method_annotated(context: &Context, method: Node, prefix: &str) -> bool {
    if annotated_with(context, method, prefix) {
        return true;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return false };
    super_methods(context.resolver.index, origin, declared).iter().any(|(_, above)| above.detail.annotations.iter().any(|name| name.starts_with(prefix)))
}

fn class_name<'f>(context: &'f Context, class: Node) -> Option<&'f String> {
    context.resolver.scope.names.get(&class.id())
}

fn walk_up(context: &Context, node: Node, junit: bool) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        if at.kind() == "method_declaration" && method_annotated(context, at, if junit { "org.junit." } else { "org.testng." }) {
            return true;
        }
        if TYPE_DECLARATIONS.contains(&at.kind()) {
            if junit {
                let case = class_name(context, at).is_some_and(|name| context.resolver.index.is_subtype(name, "junit.framework.TestCase"));
                if case || context.resolver.annotation_names(at).iter().any(|name| name == "org.junit.runner.RunWith") {
                    return true;
                }
            } else if annotated_with(context, at, "org.testng.") {
                return true;
            }
        }
        current = parent(at);
    }
    false
}

pub fn is_junit_test_code(context: &Context, node: Node) -> bool {
    walk_up(context, node, true)
}

pub fn is_testng_test_code(context: &Context, node: Node) -> bool {
    walk_up(context, node, false)
}
