//! TruthIncompatibleType: a Truth assertion compares values whose types can never be equal.
use super::Context;
use super::call_match::static_on_class;
use super::compat::{castable, compatibility};
use super::junit_more::{bounded, ignoring_casts};
use super::method_call_checks::erased_subtype;
use super::odd_calls::receiver_class;
use super::shape::arguments;
use super::target::is_numeric;
use crate::java::types::model::{OBJECT, Type};
use crate::java::types::scope::Resolver;
use tree_sitter::Node;

const NAME: &str = "TruthIncompatibleType";
const SUBJECT: &str = "com.google.common.truth.Subject";
const ITERABLE_SUBJECT: &str = "com.google.common.truth.IterableSubject";
const STREAM_SUBJECT: &str = "com.google.common.truth.StreamSubject";
const MAP_SUBJECT: &str = "com.google.common.truth.MapSubject";
const MULTIMAP_SUBJECT: &str = "com.google.common.truth.MultimapSubject";
const MULTISET_SUBJECT: &str = "com.google.common.truth.MultisetSubject";
const PROTO_FLUENT: &str = "com.google.common.truth.extensions.proto.ProtoFluentAssertion";
const PROTO_SUBJECT: &str = "com.google.common.truth.extensions.proto.ProtoSubject";
const BUILDER: &str = "com.google.common.truth.StandardSubjectBuilder";
const CORRESPONDENCE: &str = "com.google.common.truth.Correspondence";
const ITERABLE: &str = "java.lang.Iterable";
const NUMBER: &str = "java.lang.Number";
const VECTOR_NAMES: [&str; 4] = ["containsExactlyElementsIn", "containsAnyIn", "containsAtLeastElementsIn", "containsNoneIn"];

fn instance_on(context: &Context, call: Node, owners: &[&str], names: &[&str]) -> bool {
    let names = if names.is_empty() { None } else { Some(names) };
    if call.kind() != "method_invocation" {
        return false;
    }
    if names.is_some_and(|names| call.child_by_field_name("name").is_none_or(|name| !names.contains(&context.text(name)))) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    !resolved.method.is_static && receiver_class(context, call).is_some_and(|class| owners.iter().any(|owner| context.resolver.index.is_subtype(&class, owner)))
}

fn start_of_assertion(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation"
        && (static_on_class(context, call, "com.google.common.truth.Truth", &["assertThat"])
            || static_on_class(context, call, "com.google.common.truth.Truth8", &["assertThat"])
            || static_on_class(context, call, "com.google.common.truth.extensions.proto.ProtoTruth", &["assertThat"])
            || instance_on(context, call, &[BUILDER], &["that"]))
}

/// The receiver when it is the start of an assertion.
fn assertion_start<'t>(context: &Context, call: Node<'t>) -> Option<Node<'t>> {
    call.child_by_field_name("object").filter(|receiver| start_of_assertion(context, *receiver))
}

fn only_argument(call: Node) -> Option<Node> {
    arguments(call).first().copied()
}

struct Pieces<'t> {
    context: &'t Context<'t>,
    printing: Resolver<'t>,
    call: Node<'t>,
}

impl<'t> Pieces<'t> {
    fn type_of(&self, node: Node) -> Option<Type> {
        self.printing.type_of(node)
    }

    /// `extractTypeArgAsMemberOfSupertype`: a type argument of the type seen as `supertype`.
    fn extract(&self, kind: &Type, supertype: &str, at: usize) -> Option<Type> {
        let kind = match kind {
            Type::Variable(_) => bounded(self.context, self.call, kind, 0),
            other => other.clone(),
        };
        self.context.resolver.index.arguments_as(&kind, supertype)?.into_iter().nth(at)
    }

    /// The class of the parameter of the `assertThat` that starts the assertion.
    fn assertion_class(&self, start: Node) -> Option<String> {
        let resolved = self.context.resolver.resolve_call(start)?;
        match resolved.method.parameters.first()? {
            Type::Class(name, _) => Some(name.clone()),
            _ => None,
        }
    }

    fn asserted(&self, start: Node) -> Option<Type> {
        ignoring_casts(self.context, &self.printing, only_argument(start)?)
    }

    fn target(&self, start: Node, at: usize) -> Option<Type> {
        let class = self.assertion_class(start)?;
        self.extract(&self.asserted(start)?, &class, at)
    }

    fn pretty(&self, kind: &Type) -> String {
        match kind {
            Type::Class(name, arguments) if arguments.is_empty() => name.rsplit('.').next().unwrap_or(name).to_string(),
            Type::Class(name, arguments) => {
                format!("{}<{}>", name.rsplit('.').next().unwrap_or(name), arguments.iter().map(|part| self.pretty(part)).collect::<Vec<_>>().join(", "))
            }
            Type::Array(element) => format!("{}[]", self.pretty(element)),
            Type::Wildcard => "?".to_string(),
            Type::Bounded(lower, bound) => format!("{}{}", if *lower { "? super " } else { "? extends " }, self.pretty(bound)),
            other => other.name(),
        }
    }

    fn qualified(&self, kind: &Type) -> String {
        match kind {
            Type::Class(name, arguments) if arguments.is_empty() => name.clone(),
            Type::Class(name, arguments) => format!("{name}<{}>", arguments.iter().map(|part| self.qualified(part)).collect::<Vec<_>>().join(",")),
            Type::Array(element) => format!("{}[]", self.qualified(element)),
            Type::Wildcard => "?".to_string(),
            Type::Bounded(lower, bound) => format!("{}{}", if *lower { "? super " } else { "? extends " }, self.qualified(bound)),
            other => other.name(),
        }
    }

    /// The types in the order of the message: source and target as printed, the second pair when the first prints alike.
    fn names(&self, source: &Type, target: &Type) -> (String, String) {
        let (source_name, target_name) = (self.pretty(source), self.pretty(target));
        if source_name == target_name { (self.qualified(source), self.qualified(target)) } else { (source_name, target_name) }
    }

    /// The upper bound of the type as `getUpperBound` takes it, type variables replaced by their bounds.
    fn upper(&self, kind: &Type) -> Type {
        match kind {
            Type::Bounded(false, bound) => self.upper(bound),
            Type::Bounded(true, _) | Type::Wildcard => Type::class(OBJECT),
            other => bounded(self.context, self.call, other, 0),
        }
    }

    fn check(&self, tree: Node, target: Option<Type>, source: Option<Type>) {
        let (Some(target), Some(source)) = (target, source) else { return };
        let Some(report) = compatibility(self.context, &self.upper(&target), &self.upper(&source), &[], &[]) else { return };
        let (source_name, target_name) = self.names(&source, &target);
        let message = format!(
            "Argument '{}' should not be passed to this method: its type `{source_name}` is not compatible with `{target_name}`{}",
            self.context.text(tree),
            report.extra
        );
        self.context.report_fixed(NAME, self.call, super::shape::preferred(tree), &message, &[]);
    }

    fn is_numeric_type(&self, kind: &Type) -> bool {
        is_numeric(kind) || erased_subtype(self.context, self.call, kind, NUMBER, 0)
    }

    /// Whether a varargs method is called with the array itself.
    fn non_varargs_call(&self, count: usize, varargs: bool, index: usize, argument: &Option<Type>) -> bool {
        count - 1 == index && varargs && matches!(argument, Some(Type::Array(element)) if !matches!(**element, Type::Primitive(_)))
    }

    fn scalar_contains(&self, target: &Option<Type>) {
        let Some(resolved) = self.context.resolver.resolve_call(self.call) else { return };
        let count = resolved.method.parameters.len();
        for (index, argument) in arguments(self.call).into_iter().enumerate() {
            let kind = self.type_of(argument);
            let source = if self.non_varargs_call(count, resolved.method.varargs, index, &kind) {
                match kind {
                    Some(Type::Array(element)) => Some(*element),
                    _ => None,
                }
            } else {
                kind
            };
            self.check(argument, target.clone(), source);
        }
    }

    fn equality(&self) {
        if !instance_on(self.context, self.call, &[SUBJECT, PROTO_FLUENT], &["isEqualTo", "isNotEqualTo"]) {
            return;
        }
        let mut receiver = self.call.child_by_field_name("object");
        let start = loop {
            let Some(current) = receiver.filter(|current| current.kind() == "method_invocation") else { return };
            if start_of_assertion(self.context, current) {
                break current;
            }
            if !instance_on(self.context, current, &[PROTO_FLUENT, PROTO_SUBJECT], &[]) {
                return;
            }
            receiver = current.child_by_field_name("object");
        };
        let (Some(argument), Some(target)) = (only_argument(self.call), self.asserted(start)) else { return };
        let source = self.type_of(argument);
        if source.as_ref().is_some_and(|source| self.is_numeric_type(source)) && self.is_numeric_type(&target) {
            return;
        }
        self.check(argument, Some(target), source);
    }

    fn any_of(&self) {
        if !instance_on(self.context, self.call, &[SUBJECT], &["isAnyOf", "isNoneOf"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let target = self.asserted(start);
        self.scalar_contains(&target);
    }

    fn is_in(&self) {
        if !instance_on(self.context, self.call, &[SUBJECT], &["isIn", "isNotIn"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let Some(argument) = only_argument(self.call) else { return };
        let source = self.type_of(argument).and_then(|kind| match &kind {
            Type::Class(name, _) => self.extract(&kind, &name.clone(), 0),
            _ => None,
        });
        self.check(argument, self.asserted(start), source);
    }

    fn vector_contains(&self) {
        let owners = [ITERABLE_SUBJECT, STREAM_SUBJECT];
        if !instance_on(self.context, self.call, &owners, &VECTOR_NAMES) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let (Some(class), Some(argument)) = (self.assertion_class(start), only_argument(self.call)) else { return };
        let parameters = self.context.resolver.resolve_call(self.call).map(|resolved| resolved.method.parameters).unwrap_or_default();
        let iterable = matches!(parameters.as_slice(), [Type::Class(name, _)] if name == ITERABLE);
        let target = self.asserted(start).and_then(|kind| self.extract(&kind, &class, 0));
        if iterable {
            let source = self.type_of(argument).and_then(|kind| self.extract(&kind, &class, 0));
            self.check(argument, target, source);
        } else if instance_on(self.context, self.call, &[ITERABLE_SUBJECT], &VECTOR_NAMES) {
            let source = match self.type_of(argument) {
                Some(Type::Array(element)) => Some(*element),
                _ => None,
            };
            self.check(argument, target, source);
        }
    }

    fn scalar_contains_call(&self) {
        let names = ["contains", "containsExactly", "doesNotContain", "containsAnyOf", "containsNoneOf", "containsAtLeast"];
        if !instance_on(self.context, self.call, &[ITERABLE_SUBJECT, STREAM_SUBJECT], &names) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let target = self.target(start, 0);
        self.scalar_contains(&target);
    }

    fn correspondence(&self) {
        if !instance_on(self.context, self.call, &[ITERABLE_SUBJECT], &["comparingElementsUsing"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let (Some(target), Some(argument)) = (self.target(start, 0), only_argument(self.call)) else { return };
        let Some(source) = self.type_of(argument).and_then(|kind| self.extract(&kind, CORRESPONDENCE, 0)) else { return };
        if castable(self.context, &self.upper(&target).erased(), &self.upper(&source).erased()) {
            return;
        }
        let (source_name, target_name) = self.names(&source, &target);
        let message = format!(
            "Argument '{}' should not be passed to this method: its type `{source_name}` is not compatible with `{target_name}`",
            self.context.text(argument)
        );
        self.context.report_fixed(NAME, self.call, super::shape::preferred(argument), &message, &[]);
    }

    fn map_owners() -> [&'static str; 2] {
        [MAP_SUBJECT, MULTIMAP_SUBJECT]
    }

    fn map_vector_contains(&self) {
        if !instance_on(self.context, self.call, &Self::map_owners(), &["containsExactlyEntriesIn", "containsAtLeastEntriesIn"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let (Some(class), Some(argument)) = (self.assertion_class(start), only_argument(self.call)) else { return };
        let Some(asserted) = self.asserted(start) else { return };
        let given = self.type_of(argument);
        for at in 0..2 {
            let source = given.as_ref().and_then(|kind| self.extract(kind, &class, at));
            self.check(argument, self.extract(&asserted, &class, at), source);
        }
    }

    fn map_contains_key(&self) {
        if !instance_on(self.context, self.call, &Self::map_owners(), &["containsKey", "doesNotContainKey"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let Some(argument) = only_argument(self.call) else { return };
        let target = self.target(start, 0);
        self.check(argument, target, self.type_of(argument));
    }

    fn map_scalar_contains(&self) {
        if !instance_on(self.context, self.call, &Self::map_owners(), &["containsEntry", "doesNotContainEntry", "containsExactly", "containsAtLeast"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let (Some(key), Some(value)) = (self.target(start, 0), self.target(start, 1)) else { return };
        let Some(resolved) = self.context.resolver.resolve_call(self.call) else { return };
        let count = resolved.method.parameters.len();
        for (index, argument) in arguments(self.call).into_iter().enumerate() {
            let kind = self.type_of(argument);
            if self.non_varargs_call(count, resolved.method.varargs, index, &kind) {
                continue;
            }
            self.check(argument, Some(if index % 2 == 0 { key.clone() } else { value.clone() }), kind);
        }
    }

    fn has_count(&self) {
        if !instance_on(self.context, self.call, &[MULTISET_SUBJECT], &["hasCount"]) {
            return;
        }
        let Some(start) = assertion_start(self.context, self.call) else { return };
        let Some(argument) = only_argument(self.call) else { return };
        let target = self.target(start, 0);
        self.check(argument, target, self.type_of(argument));
    }
}

pub fn truth_incompatible_type(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("object").is_none() {
        return;
    }
    let pieces = Pieces { context, printing: context.resolver.printing(), call };
    pieces.equality();
    pieces.any_of();
    pieces.is_in();
    pieces.vector_contains();
    pieces.scalar_contains_call();
    pieces.correspondence();
    pieces.map_vector_contains();
    pieces.map_contains_key();
    pieces.map_scalar_contains();
    pieces.has_count();
}
