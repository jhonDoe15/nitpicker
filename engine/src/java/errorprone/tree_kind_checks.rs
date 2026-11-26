//! PreferInstanceofOverGetKind: `tree.getKind() == Tree.Kind.X` where one tree interface stands for the kind.
use super::equals_methods::instance_equals_call;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::lookup::field_of;
use super::owners::{is_descendant, receiver_name};
use super::parts::only_argument;
use super::positions::preferred;
use super::Context;
use crate::engine::source::parent;
use tree_sitter::Node;

const KIND: &str = "com.sun.source.tree.Tree.Kind";
const TREE_PACKAGE: &str = "com.sun.source.tree";

/// The kinds of the JDK's `Tree.Kind` that are the only one of their tree interface, with that interface.
const UNIQUE_KINDS: &[(&str, &str)] = &[
    ("ANNOTATED_TYPE", "AnnotatedTypeTree"),
    ("ARRAY_ACCESS", "ArrayAccessTree"),
    ("ARRAY_TYPE", "ArrayTypeTree"),
    ("ASSERT", "AssertTree"),
    ("ASSIGNMENT", "AssignmentTree"),
    ("BLOCK", "BlockTree"),
    ("BREAK", "BreakTree"),
    ("CASE", "CaseTree"),
    ("CATCH", "CatchTree"),
    ("COMPILATION_UNIT", "CompilationUnitTree"),
    ("CONDITIONAL_EXPRESSION", "ConditionalExpressionTree"),
    ("CONTINUE", "ContinueTree"),
    ("DO_WHILE_LOOP", "DoWhileLoopTree"),
    ("ENHANCED_FOR_LOOP", "EnhancedForLoopTree"),
    ("EXPRESSION_STATEMENT", "ExpressionStatementTree"),
    ("MEMBER_SELECT", "MemberSelectTree"),
    ("MEMBER_REFERENCE", "MemberReferenceTree"),
    ("FOR_LOOP", "ForLoopTree"),
    ("IDENTIFIER", "IdentifierTree"),
    ("IF", "IfTree"),
    ("IMPORT", "ImportTree"),
    ("INSTANCE_OF", "InstanceOfTree"),
    ("TEMPLATE", "StringTemplateTree"),
    ("LABELED_STATEMENT", "LabeledStatementTree"),
    ("METHOD", "MethodTree"),
    ("METHOD_INVOCATION", "MethodInvocationTree"),
    ("MODIFIERS", "ModifiersTree"),
    ("NEW_ARRAY", "NewArrayTree"),
    ("NEW_CLASS", "NewClassTree"),
    ("LAMBDA_EXPRESSION", "LambdaExpressionTree"),
    ("PACKAGE", "PackageTree"),
    ("PARENTHESIZED", "ParenthesizedTree"),
    ("ANY_PATTERN", "AnyPatternTree"),
    ("BINDING_PATTERN", "BindingPatternTree"),
    ("DEFAULT_CASE_LABEL", "DefaultCaseLabelTree"),
    ("CONSTANT_CASE_LABEL", "ConstantCaseLabelTree"),
    ("PATTERN_CASE_LABEL", "PatternCaseLabelTree"),
    ("DECONSTRUCTION_PATTERN", "DeconstructionPatternTree"),
    ("PRIMITIVE_TYPE", "PrimitiveTypeTree"),
    ("RETURN", "ReturnTree"),
    ("EMPTY_STATEMENT", "EmptyStatementTree"),
    ("SWITCH", "SwitchTree"),
    ("SWITCH_EXPRESSION", "SwitchExpressionTree"),
    ("SYNCHRONIZED", "SynchronizedTree"),
    ("THROW", "ThrowTree"),
    ("TRY", "TryTree"),
    ("PARAMETERIZED_TYPE", "ParameterizedTypeTree"),
    ("UNION_TYPE", "UnionTypeTree"),
    ("INTERSECTION_TYPE", "IntersectionTypeTree"),
    ("TYPE_CAST", "TypeCastTree"),
    ("TYPE_PARAMETER", "TypeParameterTree"),
    ("VARIABLE", "VariableTree"),
    ("WHILE_LOOP", "WhileLoopTree"),
    ("ERRONEOUS", "ErroneousTree"),
    ("MODULE", "ModuleTree"),
    ("EXPORTS", "ExportsTree"),
    ("OPENS", "OpensTree"),
    ("PROVIDES", "ProvidesTree"),
    ("REQUIRES", "RequiresTree"),
    ("USES", "UsesTree"),
    ("YIELD", "YieldTree"),
];

fn is_get_kind(context: &Context, node: Node) -> bool {
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|name| context.text(name) == "getKind")
        && receiver_name(context, node, false).is_some_and(|owner| is_descendant(context, &owner, &["com.sun.source.tree.Tree"]))
}

fn describe(context: &Context, tree: Node, left: Node, right: Node, negated: bool) {
    if !is_get_kind(context, left) || !matches!(right.kind(), "identifier" | "field_access") {
        return;
    }
    let Some((owner, field)) = field_of(context, right) else { return };
    if owner.name != KIND {
        return;
    }
    let Some((_, interface)) = UNIQUE_KINDS.iter().find(|(name, _)| *name == field.name) else { return };
    let mut fix = Fix::new();
    let name = qualify_type(context, tree, &format!("{TREE_PACKAGE}.{interface}"), &mut fix);
    let Some(receiver) = left.child_by_field_name("object").map(|object| context.text(object)) else { return };
    let replacement = format!("{receiver} instanceof {name}");
    let replacement = if negated { format!("!({replacement})") } else { replacement };
    let fix = fix.and(tree.start_byte(), tree.end_byte(), replacement);
    let message = "Prefer instanceof over getKind() checks where possible, as these work well with pattern matching instanceofs";
    context.report_fixed("PreferInstanceofOverGetKind", tree, preferred(context, tree), message, &[fix]);
}

pub fn prefer_instanceof_over_get_kind(context: &Context, node: Node) {
    match node.kind() {
        "binary_expression" => {
            let (Some(operator), Some(left), Some(right)) = (node.child_by_field_name("operator"), node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            let operator = context.text(operator);
            if matches!(operator, "==" | "!=") {
                describe(context, node, left, right, operator == "!=");
            }
        }
        "method_invocation" => {
            if !instance_equals_call(context, node) {
                return;
            }
            let (Some(receiver), Some(argument)) = (node.child_by_field_name("object"), only_argument(node)) else { return };
            let negation = parent(node).filter(|up| up.kind() == "unary_expression" && up.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!"));
            describe(context, negation.unwrap_or(node), receiver, argument, negation.is_some());
        }
        _ => {}
    }
}
