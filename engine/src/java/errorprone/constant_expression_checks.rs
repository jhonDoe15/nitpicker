//! SelfSet, TruthConstantAsserts, DuplicateAssertion and OptionalNotPresent: the checks built on `ConstantExpressions`.
use super::Context;
use super::already_checked::{Truthiness, truthiness};
use super::already_pure::{Ce, Constants};
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::nodes::position;
use super::positions::arguments;
use super::shape::preferred;
use crate::engine::source::{children, named_children};
use crate::java::helpers::declarators;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE_LITE_BUILDER: &str = "com.google.protobuf.MessageLite.Builder";
const MESSAGE_LITE_OR_BUILDER: &str = "com.google.protobuf.MessageLiteOrBuilder";
const SUBJECT: &str = "com.google.common.truth.Subject";
const JUNIT_ASSERTS: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn is_instance_call_on(context: &Context, call: Node, owner: &str) -> Option<crate::java::types::expr::Call> {
    if call.kind() != "method_invocation" {
        return None;
    }
    let resolved = context.resolver.resolve_call(call)?;
    (!resolved.method.is_static && context.resolver.index.is_subtype(&resolved.receiver.erased().name(), owner)).then_some(resolved)
}

pub fn self_set(context: &Context, node: Node) {
    let Some(setter) = is_instance_call_on(context, node, MESSAGE_LITE_BUILDER) else { return };
    let name = setter.method.name.as_str();
    let list = arguments(node);
    if !name.starts_with("set") || list.len() != 1 {
        return;
    }
    let argument = list[0];
    let Some(getter) = is_instance_call_on(context, argument, MESSAGE_LITE_OR_BUILDER).filter(|getter| getter.method.name.starts_with("get")) else { return };
    if getter.method.name != format!("get{}", &name[3..]) {
        return;
    }
    let (Some(setter_receiver), Some(getter_receiver)) = (node.child_by_field_name("object"), argument.child_by_field_name("object")) else { return };
    let constants = Constants::new(context);
    let (Some(first), Some(second)) = (constants.expression(setter_receiver), constants.expression(getter_receiver)) else { return };
    if first.key == second.key {
        let message = "This setter seems to be invoked with a value from its own getter. Is it redundant?";
        context.report_fixed("SelfSet", node, position(node), message, &[]);
    }
}

pub fn truth_constant_asserts(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| !matches!(context.text(name), "isEqualTo" | "isNotEqualTo")) {
        return;
    }
    let list = arguments(node);
    let Some(subject) = is_instance_call_on(context, node, SUBJECT) else { return };
    if list.is_empty() || subject.method.parameters != [Type::class("java.lang.Object")] {
        return;
    }
    let Some(receiver) = node.child_by_field_name("object").filter(|receiver| static_on_class(context, *receiver, "com.google.common.truth.Truth", &["assertThat"])) else { return };
    let inner = arguments(receiver);
    let ([actual], [expectation]) = (inner.as_slice(), list.as_slice()) else { return };
    let constants = Constants::new(context);
    let constant_ish = |ce: Option<Ce>| ce.is_some_and(|ce| !ce.ident);
    if !constant_ish(constants.expression(*actual)) || constant_ish(constants.expression(*expectation)) {
        return;
    }
    let fix = Fix::replace(actual.start_byte(), actual.end_byte(), context.text(*expectation)).and(expectation.start_byte(), expectation.end_byte(), context.text(*actual));
    context.report_fixed("TruthConstantAsserts", node, position(node), "Truth Library assert is called on a constant.", &[fix]);
}

/// The statements of a block as javac lists them: an empty statement counts, a declaration of several names is several.
fn javac_statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    for part in children(block) {
        match part.kind() {
            "{" | "}" => {}
            kind if kind.ends_with("comment") => {}
            "local_variable_declaration" => found.extend(std::iter::repeat_n(part, declarators(part).len().max(1))),
            _ => found.push(part),
        }
    }
    found
}

struct Assertion {
    source: String,
    ce: String,
    line: usize,
}

fn skipped(resolved: &crate::java::types::expr::Call) -> usize {
    let parameters = &resolved.method.parameters;
    let string_first = matches!(parameters.first(), Some(Type::Class(name, _)) if name == "java.lang.String");
    if !string_first || parameters.len() == 2 { 0 } else { 1 }
}

fn is_subject_builder_that(context: &Context, call: Node) -> bool {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "that") {
        return false;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return false };
    let Some(kind) = context.resolver.type_of(receiver) else { return false };
    let index = context.resolver.index;
    ["StandardSubjectBuilder", "SimpleSubjectBuilder", "CustomSubjectBuilder"].iter().any(|name| index.is_subtype(&kind.erased().name(), &format!("com.google.common.truth.{name}")))
}

fn is_precondition(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    static_on_class(context, call, "com.google.common.base.Preconditions", &["checkArgument", "checkState", "checkNotNull"])
        || static_on_class(context, call, "com.google.common.base.Verify", &[name])
        || static_on_class(context, call, "java.util.Objects", &["requireNonNull"])
}

fn assertion_lines(context: &Context, block: Node) -> Vec<Assertion> {
    let constants = Constants::new(context);
    let mut found: Vec<Assertion> = Vec::new();
    let mut add = |source: String, ce: Ce, line: usize| {
        if !found.iter().any(|known| known.source == source && known.ce == ce.key && known.line == line) {
            found.push(Assertion { source, ce: ce.key, line });
        }
    };
    for (line, statement) in javac_statements(block).into_iter().enumerate() {
        if statement.kind() != "expression_statement" {
            continue;
        }
        let Some(top) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).filter(|part| part.kind() == "method_invocation") else { continue };
        let mut current = Some(top);
        while let Some(method) = current.filter(|part| part.kind() == "method_invocation") {
            let list = arguments(method);
            let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let junit = matches!(name, "assertEquals" | "assertNotEquals") && JUNIT_ASSERTS.iter().any(|owner| static_on_class(context, method, owner, &[name]));
            if junit {
                if let Some(resolved) = context.resolver.resolve_call(method) {
                    if let Some(ce) = list.get(skipped(&resolved) + 1).and_then(|argument| constants.expression(*argument)) {
                        add(context.text(statement).to_string(), ce, line);
                    }
                }
            } else if is_precondition(context, method) && method.id() == top.id() && !list.is_empty() {
                let source = context.file.text[method.start_byte()..list[0].end_byte()].to_string();
                if let Some(ce) = constants.expression(list[0]) {
                    add(source, ce, line);
                }
            } else if (name == "assertThat" || is_subject_builder_that(context, method)) && list.len() == 1 {
                if let Some(ce) = constants.expression(list[0]) {
                    add(context.text(statement).to_string(), ce, line);
                }
            }
            current = method.child_by_field_name("object");
        }
    }
    found
}

pub fn duplicate_assertion(context: &Context, node: Node) {
    if !matches!(node.kind(), "block" | "constructor_body") {
        return;
    }
    let lines = assertion_lines(context, node);
    if lines.is_empty() {
        return;
    }
    let all = javac_statements(node);
    for entry in &lines {
        if entry.line > 0 && lines.iter().any(|other| other.source == entry.source && other.ce == entry.ce && other.line + 1 == entry.line) {
            let statement = all[entry.line];
            context.report_fixed("DuplicateAssertion", statement, statement.start_byte(), "This assertion is duplicated on the line above. Is that a mistake?", &[]);
        }
    }
}

struct Known(Vec<Ce>);

impl Known {
    fn add(&mut self, ces: &[Ce]) {
        self.0.extend(ces.iter().cloned());
    }
    fn remove(&mut self, ces: &[Ce]) {
        for ce in ces {
            if let Some(at) = self.0.iter().position(|known| known.key == ce.key) {
                self.0.remove(at);
            }
        }
    }
}

struct Scanner<'c, 'a> {
    context: &'c Context<'a>,
    constants: Constants<'c, 'a, 'c>,
    truths: Known,
    falsehoods: Known,
}

const OPTIONAL_GET: [(&str, &[&str]); 2] = [("com.google.common.base.Optional", &["get"]), ("java.util.Optional", &["get", "orElseThrow"])];

impl<'c, 'a> Scanner<'c, 'a> {
    fn within_scope(&mut self, found: Truthiness, tree: Option<Node<'c>>) {
        self.truths.add(&found.required_true);
        self.falsehoods.add(&found.required_false);
        if let Some(tree) = tree {
            self.visit(tree);
        }
        self.truths.remove(&found.required_true);
        self.falsehoods.remove(&found.required_false);
    }

    fn branches(&mut self, node: Node<'c>) {
        let Some(condition) = node.child_by_field_name("condition") else { return };
        let when_true = truthiness(self.context, &self.constants, condition, false);
        self.within_scope(when_true, node.child_by_field_name("consequence"));
        let when_false = truthiness(self.context, &self.constants, condition, true);
        self.within_scope(when_false, node.child_by_field_name("alternative"));
    }

    fn check(&mut self, node: Node<'c>) {
        let context = self.context;
        let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
        let Some(receiver) = node.child_by_field_name("object") else { return };
        if !OPTIONAL_GET.iter().any(|(_, names)| names.contains(&name)) {
            return;
        }
        let Some(resolved) = context.resolver.resolve_call(node).filter(|found| !found.method.is_static) else { return };
        let owner = resolved.receiver.erased().name();
        let index = context.resolver.index;
        if !OPTIONAL_GET.iter().any(|(class, names)| names.contains(&name) && index.is_subtype(&owner, class)) {
            return;
        }
        let Some(ce) = self.constants.expression(receiver) else { return };
        let called = |known: &Known, method: &str| known.0.iter().any(|truth| truth.method.as_deref() == Some(method) && truth.receiver.as_deref() == Some(ce.key.as_str()));
        if called(&self.truths, "isEmpty") || called(&self.falsehoods, "isPresent") {
            context.report_fixed("OptionalNotPresent", node, preferred(node), "This Optional has been confirmed to be empty at this point, so the call to `get()` or `orElseThrow()` will always throw.", &[]);
        }
    }

    fn visit(&mut self, node: Node<'c>) {
        match node.kind() {
            "if_statement" | "ternary_expression" => return self.branches(node),
            "method_invocation" => self.check(node),
            _ => {}
        }
        for child in children(node) {
            if child.is_named() && !child.kind().ends_with("comment") {
                self.visit(child);
            }
        }
    }
}

pub fn optional_not_present(context: &Context, root: Node) {
    let mut scanner = Scanner { context, constants: Constants::new(context), truths: Known(Vec::new()), falsehoods: Known(Vec::new()) };
    scanner.visit(root);
}
