//! nitpicker PMD XPath rules that need types (typeIs, matchesSig), run against the project type index.
use crate::java::fields::Fields;
use super::helpers::{annotation_names, declarators, has_modifier, in_interface_or_annotation, report};
use super::types::expr::unwrap;
use super::types::model::Type;
use super::types::project::JavaProject;
use super::types::scope::Resolver;
use crate::engine::source::{SourceFile, ancestor, children, walk};
use crate::engine::{FileRule, Project, finding::Finding};
use regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

type Check = fn(&Resolver, Node, &'static str, &mut Vec<Finding>);

struct Typed {
    id: &'static str,
    check: Check,
}

impl FileRule for Typed {
    fn id(&self) -> &'static str {
        self.id
    }
    fn needs_project(&self) -> bool {
        true
    }
    fn check(&self, _file: &SourceFile, _out: &mut Vec<Finding>) {}
    fn check_in(&self, file: &SourceFile, project: &Project, out: &mut Vec<Finding>) {
        let Some(project) = project.downcast_ref::<JavaProject>() else { return };
        let scope = &crate::java::types::scope::FileScope::of(file);
        let resolver = Resolver::new(&project.index, file, scope);
        walk(file.tree.root_node(), |node| (self.check)(&resolver, node, self.id, out));
    }
}

fn call_name<'f>(file: &'f SourceFile, call: Node) -> &'f str {
    call.field("name").map(|name| file.text_of(name)).unwrap_or_default()
}

fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let Some(list) = call.field("arguments") else { return Vec::new() };
    let mut cursor = list.walk();
    list.named_children(&mut cursor).filter(|node| !node.kind().ends_with("comment")).collect()
}

fn receiver<'t>(call: Node<'t>) -> Option<Node<'t>> {
    call.field("object").map(unwrap)
}

fn any_type(resolver: &Resolver, expression: Node, names: &[&str]) -> bool {
    names.iter().any(|name| resolver.type_is(expression, name))
}

fn variable_use(node: Node) -> bool {
    node.kind() == "identifier"
        && node.parent().is_none_or(|parent| match parent.kind() {
            "method_invocation" => parent.field("name") != Some(node),
            "field_access" => parent.field("field") != Some(node),
            _ => true,
        })
}

fn calls_in<'t>(root: Node<'t>) -> Vec<Node<'t>> {
    let mut calls = Vec::new();
    walk(root, |node| {
        if node.kind() == "method_invocation" {
            calls.push(node);
        }
    });
    calls
}

const REGEX_CALLS: &[&str] = &[
    "java.util.regex.Pattern#compile(java.lang.String)",
    "java.util.regex.Pattern#compile(java.lang.String,int)",
    "java.util.regex.Pattern#matches(java.lang.String,java.lang.CharSequence)",
    "java.lang.String#matches(java.lang.String)",
    "java.lang.String#replaceAll(java.lang.String,java.lang.String)",
    "java.lang.String#replaceFirst(java.lang.String,java.lang.String)",
    "java.lang.String#split(_*)",
    "java.lang.String#splitWithDelimiters(_*)",
];

fn regex_literal(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(first) = arguments(node).first().map(|argument| unwrap(*argument)) else { return };
    let literal = first.kind() == "string_literal" && !resolver.file.text_of(first).starts_with("\"\"\"");
    if literal && REGEX_CALLS.iter().any(|signature| resolver.matches_sig(node, signature)) {
        report(out, resolver.file, first, id, "Regex literal handed to a regex call.".into());
    }
}

fn plain_text_regex(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    static SPECIAL: OnceLock<Regex> = OnceLock::new();
    if node.kind() != "method_invocation" || call_name(resolver.file, node) != "replaceAll" {
        return;
    }
    let Some(value) = arguments(node).first().and_then(|first| resolver.constant_string(*first)) else { return };
    let special = SPECIAL.get_or_init(|| Regex::new(r"[\\^$.|?*+()\[\]{}]").expect("format"));
    if !special.is_match(&value) && resolver.matches_sig(node, "java.lang.String#replaceAll(java.lang.String,java.lang.String)") {
        report(out, resolver.file, node, id, "replaceAll with a plain-text pattern.".into());
    }
}

const MUTATORS: &[&str] = &[
    "add", "addAll", "addFirst", "addLast", "remove", "removeAll", "removeIf", "removeFirst", "removeLast", "retainAll",
    "clear", "put", "putAll", "putIfAbsent", "merge", "compute", "computeIfAbsent", "computeIfPresent", "replaceAll",
    "sort", "set", "push", "pop", "poll", "offer",
];
const STATIC_MUTATORS: &[&str] =
    &["sort", "parallelSort", "fill", "setAll", "shuffle", "reverse", "swap", "rotate", "replaceAll", "addAll"];
const COPIES: &[&str] = &["copyOf", "copyOfRange", "clone", "collect", "toList", "toArray", "toSet", "toMap"];
const SHARED: &[&str] = &[
    "java.util.concurrent.BlockingQueue",
    "java.util.concurrent.BlockingDeque",
    "java.util.concurrent.TransferQueue",
    "java.util.concurrent.ConcurrentMap",
    "java.util.concurrent.ConcurrentLinkedQueue",
    "java.util.concurrent.ConcurrentLinkedDeque",
    "java.util.concurrent.CopyOnWriteArrayList",
    "java.util.concurrent.CopyOnWriteArraySet",
    "java.util.concurrent.ConcurrentSkipListSet",
];
const MEMBER_HOLDERS: &[&str] =
    &["program", "class_body", "interface_body", "enum_body_declarations", "annotation_type_body"];

fn array_root<'t>(access: Node<'t>, depth: usize) -> Option<Node<'t>> {
    let mut current = unwrap(access);
    for _ in 0..depth {
        if current.kind() != "array_access" {
            return None;
        }
        current = unwrap(current.field("array")?);
        if current.kind() == "identifier" {
            return Some(current);
        }
    }
    None
}

fn mutation_targets<'t>(resolver: &Resolver, node: Node<'t>) -> Vec<Node<'t>> {
    let file = resolver.file;
    let mut targets = Vec::new();
    match node.kind() {
        "method_invocation" => {
            let Some(object) = receiver(node) else { return targets };
            let name = call_name(file, node);
            let on_this = object.kind() == "field_access"
                && object.field("object").is_some_and(|owner| owner.kind() == "this");
            if MUTATORS.contains(&name)
                && (object.kind() == "identifier" || on_this)
                && any_type(resolver, object, &["java.util.Collection", "java.util.Map"])
            {
                targets.push(object);
            }
            let holder = file.text_of(object).rsplit('.').next().unwrap_or_default().trim();
            if STATIC_MUTATORS.contains(&name)
                && matches!(holder, "Arrays" | "Collections")
                && !(object.kind() == "identifier" && resolver.is_variable(object, holder))
            {
                targets.extend(arguments(node).first().map(|first| unwrap(*first)).filter(|first| first.kind() == "identifier"));
            }
        }
        "assignment_expression" => targets.extend(node.field("left").and_then(|left| array_root(left, 3))),
        "update_expression" => {
            targets.extend(children(node).into_iter().find(|part| part.is_named()).and_then(|operand| array_root(operand, 2)));
        }
        _ => {}
    }
    targets
}

fn parameter_names<'f>(file: &'f SourceFile, method: Node) -> Vec<&'f str> {
    let Some(list) = method.field("parameters") else { return Vec::new() };
    children(list)
        .into_iter()
        .filter_map(|parameter| match parameter.kind() {
            "formal_parameter" => parameter.field("name"),
            "spread_parameter" => declarators(parameter).first().and_then(|declarator| declarator.field("name")),
            _ => None,
        })
        .map(|name| file.text_of(name))
        .collect()
}

fn parameter_mutation(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    let file = resolver.file;
    for at in mutation_targets(resolver, node) {
        let name = file.text_of(if at.kind() == "identifier" { at } else { at.field("field").unwrap_or(at) });
        let Some(method) = ancestor(at, &["method_declaration", "constructor_declaration"]) else { continue };
        if has_modifier(method, "private") || annotation_names(file, method).iter().any(|n| n.rsplit('.').next() == Some("Override")) {
            continue;
        }
        let mut hidden = false;
        let mut current = method.parent();
        while let Some(owner) = current {
            let kind = owner.kind();
            let local = super::types::scope::TYPE_DECLARATIONS.contains(&kind)
                && owner.parent().is_some_and(|holder| !MEMBER_HOLDERS.contains(&holder.kind()));
            let private = matches!(kind, "class_declaration" | "interface_declaration") && has_modifier(owner, "private");
            hidden |= kind == "object_creation_expression" || local || private;
            current = owner.parent();
        }
        if hidden {
            continue;
        }
        let parameters = parameter_names(file, method);
        let is_parameter = |value: Option<Node>| {
            value.map(unwrap).is_some_and(|value| value.kind() == "identifier" && parameters.contains(&file.text_of(value)))
        };
        let named = |holder: Node, field: &'static str| holder.field(field).is_some_and(|n| file.text_of(n) == name);
        let mut aliased = at.kind() == "identifier" && parameters.contains(&name);
        let mut replaced = false;
        walk(method, |inner| match inner.kind() {
            "variable_declarator" | "resource" => {
                aliased |= named(inner, "name") && is_parameter(inner.field("value"));
            }
            "assignment_expression" if inner.field("operator").is_some_and(|o| file.text_of(o) == "=") => {
                let Some(left) = inner.field("left").map(unwrap) else { return };
                let Some(right) = inner.field("right").map(unwrap) else { return };
                let onto = match left.kind() {
                    "identifier" => file.text_of(left) == name,
                    "field_access" => named(left, "field"),
                    _ => false,
                };
                aliased |= onto && is_parameter(Some(right));
                let fresh = matches!(right.kind(), "object_creation_expression" | "array_creation_expression")
                    || (right.kind() == "method_invocation" && COPIES.contains(&call_name(file, right)));
                if left.kind() == "identifier" && onto && fresh && inner.start_byte() < at.start_byte() {
                    walk(right, |used| replaced |= variable_use(used) && file.text_of(used) == name);
                }
            }
            _ => {}
        });
        if aliased && !replaced && !any_type(resolver, at, SHARED) {
            report(out, file, at, id, "Mutates an argument the caller still owns.".into());
        }
    }
}

const POSITIONAL: &[&str] = &[
    "get", "set", "indexOf", "lastIndexOf", "subList", "listIterator", "sort", "replaceAll", "getFirst", "getLast",
    "addFirst", "addLast", "removeFirst", "removeLast", "reversed",
];
const LOOPS: &[&str] = &["enhanced_for_statement", "for_statement", "while_statement", "do_statement"];
const ITERATING: &[&str] = &[
    "forEach", "forEachOrdered", "map", "flatMap", "filter", "anyMatch", "allMatch", "noneMatch", "peek", "removeIf",
    "mapToObj", "mapToInt", "mapToLong", "mapToDouble", "takeWhile", "dropWhile",
];

fn declared_in<'t>(file: &SourceFile, block: Node<'t>, name: &str) -> Option<Node<'t>> {
    children(block)
        .into_iter()
        .filter(|statement| statement.kind() == "local_variable_declaration")
        .flat_map(declarators)
        .find(|declarator| declarator.field("name").is_some_and(|n| file.text_of(n) == name))
}

fn list_used_as_set(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    let file = resolver.file;
    if node.kind() != "method_invocation" || call_name(file, node) != "contains" || arguments(node).len() != 1 {
        return;
    }
    let Some(object) = receiver(node).filter(|object| object.kind() == "identifier") else { return };
    let name = file.text_of(object);
    let mut current = node.parent();
    let mut found = None;
    while let Some(scope) = current {
        if matches!(scope.kind(), "block" | "constructor_body") {
            if let Some(declarator) = declared_in(file, scope, name) {
                found = Some((scope, declarator));
                break;
            }
        }
        current = scope.parent();
    }
    let Some((block, declarator)) = found else { return };
    let created = declarator.field("value").map(unwrap).is_some_and(|value| {
        value.kind() == "object_creation_expression" && any_type(resolver, value, &["java.util.ArrayList", "java.util.LinkedList"])
    });
    if !created || declarator.start_byte() >= node.start_byte() {
        return;
    }
    let uses: Vec<Node> = calls_in(block)
        .into_iter()
        .filter(|call| receiver(*call).is_some_and(|o| o.kind() == "identifier" && file.text_of(o) == name))
        .collect();
    let adds = |count: usize| uses.iter().any(|call| call_name(file, *call) == "add" && arguments(*call).len() == count);
    let by_index = uses.iter().any(|call| {
        call_name(file, *call) == "remove"
            && arguments(*call).first().is_some_and(|first| resolver.type_of(*first) == Some(Type::Primitive("int")))
    });
    if !adds(1) || adds(2) || by_index || uses.iter().any(|call| POSITIONAL.contains(&call_name(file, *call))) {
        return;
    }
    let mut repeated = false;
    let mut current = node.parent();
    while let Some(outer) = current {
        let iterates = outer.kind() == "lambda_expression"
            && outer.parent().filter(|list| list.kind() == "argument_list").and_then(|list| list.parent()).is_some_and(|call| {
                call.kind() == "method_invocation"
                    && ITERATING.contains(&call_name(file, call))
                    && receiver(call).is_some_and(|source| {
                        any_type(resolver, source, &["java.util.stream.BaseStream", "java.lang.Iterable", "java.util.Map"])
                    })
            });
        repeated |= (LOOPS.contains(&outer.kind()) || iterates) && outer.start_byte() > declarator.start_byte();
        current = outer.parent();
    }
    if repeated {
        report(out, file, node, id, "List searched in a loop where a set would do.".into());
    }
}

const COLLECTION_MUTATORS: &[&str] = &[
    "add", "addAll", "put", "putAll", "putIfAbsent", "remove", "clear", "merge", "compute", "computeIfAbsent", "offer",
    "push", "poll", "pop", "addFirst", "addLast", "removeIf", "replaceAll", "sort",
];
const CONCURRENT: &[&str] = &[
    "java.util.concurrent.ConcurrentMap",
    "java.util.concurrent.CopyOnWriteArrayList",
    "java.util.concurrent.CopyOnWriteArraySet",
    "java.util.concurrent.ConcurrentLinkedQueue",
    "java.util.concurrent.ConcurrentLinkedDeque",
    "java.util.concurrent.ConcurrentSkipListSet",
    "java.util.concurrent.BlockingQueue",
    "java.util.concurrent.BlockingDeque",
];

fn mutable_static_collection(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    let file = resolver.file;
    if !matches!(node.kind(), "field_declaration" | "constant_declaration") {
        return;
    }
    let constant = in_interface_or_annotation(node);
    let has = |keyword: &str| has_modifier(node, keyword);
    if !constant && !(has("static") && has("final")) {
        return;
    }
    let created: Vec<Node> = declarators(node)
        .into_iter()
        .filter_map(|declarator| declarator.field("value").map(unwrap))
        .filter(|value| value.kind() == "object_creation_expression")
        .collect();
    if !created.iter().any(|value| any_type(resolver, *value, &["java.util.Collection", "java.util.Map"])) {
        return;
    }
    if has("private") && created.iter().any(|value| any_type(resolver, *value, CONCURRENT)) {
        return;
    }
    let names: Vec<&str> =
        declarators(node).into_iter().filter_map(|d| d.field("name")).map(|n| file.text_of(n)).collect();
    let mutated = || {
        let Some(body) = ancestor(node, &["class_body", "interface_body", "enum_body"]) else { return false };
        calls_in(body).into_iter().any(|call| {
            let target = receiver(call).and_then(|object| match object.kind() {
                "identifier" => Some(object),
                "field_access" => object.field("field"),
                _ => None,
            });
            COLLECTION_MUTATORS.contains(&call_name(file, call))
                && target.is_some_and(|target| names.contains(&file.text_of(target)))
                && ancestor(call, &["method_declaration", "constructor_declaration"]).is_some()
        })
    };
    if constant || has("public") || mutated() {
        report(out, file, node, id, "Static collection that code can change.".into());
    }
}

const FUTURES: &[&str] = &[
    "java.util.concurrent.Future",
    "java.util.concurrent.CompletableFuture",
    "java.util.concurrent.FutureTask",
    "java.util.concurrent.ScheduledFuture",
    "java.util.concurrent.ForkJoinTask",
];
const CONTINUATIONS: &[&str] = &[
    "thenApply", "thenAccept", "thenCompose", "thenRun", "thenCombine", "handle", "whenComplete", "thenApplyAsync",
    "thenAcceptAsync", "thenComposeAsync",
];

fn calls_named(file: &SourceFile, root: Node, names: &[&str]) -> bool {
    calls_in(root).into_iter().any(|call| names.contains(&call_name(file, call)))
}

fn lambda_call<'t>(lambda: Node<'t>) -> Option<Node<'t>> {
    let list = lambda.parent().filter(|list| list.kind() == "argument_list")?;
    list.parent().filter(|call| call.kind() == "method_invocation")
}

fn unbounded_wait(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    let file = resolver.file;
    if node.kind() != "method_invocation" {
        return;
    }
    let name = call_name(file, node);
    let given = arguments(node);
    let zero = given.len() == 1 && matches!(file.text_of(given[0]), "0" | "0L");
    if !matches!(name, "get" | "join" | "await") || !(given.is_empty() || (name == "join" && zero)) {
        return;
    }
    let Some(object) = receiver(node) else { return };
    let waits = (matches!(name, "get" | "join") && any_type(resolver, object, FUTURES))
        || (name == "join" && resolver.type_is(object, "java.lang.Thread"))
        || (name == "await" && resolver.type_is(object, "java.util.concurrent.CountDownLatch"));
    let timeouts = ["orTimeout", "completeOnTimeout"];
    if !waits || calls_named(file, object, &timeouts) {
        return;
    }
    let variable = (object.kind() == "identifier").then(|| file.text_of(object));
    let named = |holder: Node| holder.field("name").is_some_and(|n| Some(file.text_of(n)) == variable);
    if let (Some(_), Some(method)) = (variable, ancestor(node, &["method_declaration"])) {
        let mut bounded = false;
        walk(method, |inner| {
            if inner.kind() == "variable_declarator" && named(inner) {
                bounded |= inner.field("value").is_some_and(|value| calls_named(file, value, &timeouts));
            }
        });
        if bounded {
            return;
        }
    }
    if let Some(call) = ancestor(node, &["lambda_expression"]).and_then(lambda_call) {
        let combined = receiver(call).is_some_and(|source| calls_named(file, source, &["allOf", "anyOf"]));
        if CONTINUATIONS.contains(&call_name(file, call)) && combined {
            return;
        }
    }
    let exits = object.kind() == "method_invocation"
        && call_name(file, object) == "onExit"
        && receiver(object).is_some_and(|process| resolver.type_is(process, "java.lang.Process"));
    if exits {
        return;
    }
    let nearest = ancestor(node, &["lambda_expression", "method_declaration", "class_body"]);
    let reactive = nearest.filter(|scope| scope.kind() == "lambda_expression").and_then(lambda_call).is_some_and(|call| {
        receiver(call).is_some_and(|source| {
            any_type(resolver, source, &["reactor.core.publisher.Mono", "reactor.core.publisher.Flux"])
        })
    });
    if reactive {
        return;
    }
    let mut current = node.parent();
    while let Some(outer) = current {
        let invoked = outer.kind() == "enhanced_for_statement"
            && named(outer)
            && outer.field("value").is_some_and(|source| calls_named(file, source, &["invokeAll"]));
        if invoked {
            return;
        }
        current = outer.parent();
    }
    report(out, file, node, id, "Waits without a time limit.".into());
}

fn type_stats(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(object) = receiver(node).filter(|object| object.kind() != "super") else { return };
    let cause = if resolver.receiver(object).is_some() { "typed" } else { resolver.untyped_cause(object) };
    report(out, resolver.file, node, id, cause.to_string());
}

fn call_probe(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    use super::types::expr::Receiver;
    if node.kind() != "method_invocation" {
        return;
    }
    let target = match node.field("object") {
        None => "-".to_string(),
        Some(object) if object.kind() == "super" => "super".to_string(),
        Some(object) => match resolver.receiver(object) {
            Some(Receiver::Value(kind)) => kind.erased().name(),
            Some(Receiver::Static(owner)) => format!("static:{owner}"),
            None => "?".to_string(),
        },
    };
    let signature = resolver.resolve_call(node).map_or("?".to_string(), |call| {
        let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.name()).collect();
        format!("{}#{}({})", call.declaring, call.method.name, parameters.join(","))
    });
    let end = node.end_position();
    report(out, resolver.file, node, id, format!("{}:{}|{target}|{signature}", end.row + 1, end.column));
}

fn type_probe(resolver: &Resolver, node: Node, id: &'static str, out: &mut Vec<Finding>) {
    use super::types::expr::Receiver;
    if !node.is_named() || node.kind() == "program" || node.kind().ends_with("_statement") || node.kind().ends_with("declaration") {
        return;
    }
    let named = match node.kind() {
        "identifier" | "field_access" | "scoped_identifier" => match resolver.receiver(node) {
            Some(Receiver::Value(kind)) => kind.erased().name(),
            Some(Receiver::Static(owner)) => format!("static:{owner}"),
            None if node.parent().is_some_and(|holder| holder.kind() == "method_reference") => {
                resolver.type_node(node).map_or("?".to_string(), |kind| format!("static:{}", kind.erased().name()))
            }
            None => "?".to_string(),
        },
        "type_identifier" | "scoped_type_identifier" | "generic_type" | "array_type"
            if node.parent().is_some_and(|holder| matches!(holder.kind(), "instanceof_expression" | "method_reference")) =>
        {
            resolver.type_node(node).map_or("?".to_string(), |kind| format!("static:{}", kind.erased().name()))
        }
        _ => resolver.type_of(node).map_or("?".to_string(), |kind| kind.erased().name()),
    };
    let (start, end) = (node.start_position(), node.end_position());
    let text = resolver.file.text.as_str();
    let units = |byte: usize, column: usize| text[byte - column..byte].encode_utf16().count() + 1;
    let place = format!(
        "{}:{}-{}:{}",
        start.row + 1,
        units(node.start_byte(), start.column),
        end.row + 1,
        units(node.end_byte(), end.column)
    );
    report(out, resolver.file, node, id, format!("{place}|{}|{named}", node.kind()));
    // `Outer.super` before a call is one expression for PMD and two tokens here.
    let qualified = crate::engine::source::children(node).into_iter().find(|part| part.kind() == "super");
    if let (Some(owner), Some(keyword), "method_invocation") = (node.field("object"), qualified, node.kind()) {
        if let Some(kind) = resolver.type_node(owner) {
            let (from, to) = (owner.start_position(), keyword.end_position());
            let place = format!(
                "{}:{}-{}:{}",
                from.row + 1,
                units(owner.start_byte(), from.column),
                to.row + 1,
                units(keyword.end_byte(), to.column)
            );
            report(out, resolver.file, node, id, format!("{place}|super|{}", kind.erased().name()));
        }
    }
}

pub fn rules() -> Vec<Box<dyn FileRule>> {
    let typed = |id, check: Check| Box::new(Typed { id, check }) as Box<dyn FileRule>;
    vec![
        typed("BacktrackingRegex", regex_literal),
        typed("RegexPartDefect", regex_literal),
        typed("PlainTextRegex", plain_text_regex),
        typed("ParameterMutation", parameter_mutation),
        typed("ListUsedAsSet", list_used_as_set),
        typed("MutableStaticCollection", mutable_static_collection),
        typed("UnboundedWait", unbounded_wait),
        typed("_ReceiverTypes", type_stats),
        typed("_Calls", call_probe),
        typed("_Types", type_probe),
    ]
}
