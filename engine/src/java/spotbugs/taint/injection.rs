//! The injection sinks of FindSecBugs' path, SQL, command and LDAP patterns, from `injection-sinks.tsv`, and the
//! call each sink names in the compiled code, as SpotBugs prints it.
//!
//! What the experiments show:
//! - A call is a sink when the class it names in the compiled code, or any superclass or interface of that class,
//!   has a row for the method's name and erased parameter types. Overriding the method changes nothing, and
//!   constructors count too: `new Sub(path)` of a `File` subclass is a sink, and so is its `super(path)`.
//! - The finding names the call as compiled: the class the call names, with the method's descriptor.
//! - With several sink positions, the last position whose value is not a safe value that comes from no parameter
//!   decides the finding alone, as a single sink argument would.
use crate::engine::source::children;
use crate::java::spotbugs::Context;
use crate::java::spotbugs::names;
use crate::java::types::expr::Call;
use crate::java::types::model::Type;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::OnceLock;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    "PATH_TRAVERSAL_IN",
    "PATH_TRAVERSAL_OUT",
    "SQL_INJECTION_JDBC",
    "SQL_INJECTION_SPRING_JDBC",
    "SQL_INJECTION_JPA",
    "COMMAND_INJECTION",
    "LDAP_INJECTION",
];

/// The rows of one class and method: the pattern and its sink positions, or `None` for a method that is not a sink.
type Rows = HashMap<(String, String, String), Option<(&'static str, Vec<usize>)>>;

fn rows() -> &'static Rows {
    static ROWS: OnceLock<Rows> = OnceLock::new();
    ROWS.get_or_init(|| {
        let mut rows = Rows::new();
        for line in include_str!("injection-sinks.tsv").lines().filter(|line| !line.starts_with('#') && !line.is_empty()) {
            let parts: Vec<&str> = line.split('\t').collect();
            let [pattern, owner, name, parameters, positions] = parts[..] else { continue };
            let positions: Vec<usize> = positions.split(',').filter_map(|position| position.parse().ok()).collect();
            let found = PATTERNS.iter().find(|known| **known == pattern).map(|pattern| (*pattern, positions));
            rows.insert((owner.to_string(), name.to_string(), parameters.to_string()), found);
        }
        rows
    })
}

/// A sink call: the pattern, the positions of its sink arguments, and the call as the finding names it.
pub struct Sink {
    pub pattern: &'static str,
    pub positions: Vec<usize>,
    pub named: String,
}

/// The pattern and sink positions of a method named on a value of class `start`, from the nearest class on the
/// way up that has a row for it.
fn row(context: &Context, start: &str, name: &str, parameters: &str) -> Option<(&'static str, Vec<usize>)> {
    let rows = rows();
    let mut pending = VecDeque::from([start.to_string()]);
    let mut seen = HashSet::new();
    while let Some(class) = pending.pop_front() {
        if !seen.insert(class.clone()) {
            continue;
        }
        if let Some(found) = rows.get(&(class.clone(), name.to_string(), parameters.to_string())) {
            return found.clone();
        }
        if let Some(info) = context.resolver.index.get(&class) {
            pending.extend(info.superclass.iter().cloned());
            pending.extend(info.interfaces.iter().cloned());
        }
    }
    None
}

/// The class a call names in the compiled code.
fn owner(context: &Context, node: Node, own: &str, call: &Call) -> String {
    let named = crate::java::spotbugs::calls::owner(context, node, own);
    let fallback = match &call.receiver {
        Type::Class(..) => call.receiver.erased().name(),
        _ => call.declaring.clone(),
    };
    let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
    let named = if anonymous { call.declaring.clone() } else { named.unwrap_or(fallback) };
    if node.kind() == "explicit_constructor_invocation" && node.child_by_field_name("constructor").is_some_and(|word| word.kind() == "this") {
        return own.to_string();
    }
    named
}

fn descriptor(context: &Context, kind: &Type) -> String {
    match kind.erased() {
        Type::Array(element) => format!("[{}", descriptor(context, &element)),
        Type::Primitive(name) => match name {
            "int" => "I",
            "long" => "J",
            "boolean" => "Z",
            "byte" => "B",
            "char" => "C",
            "short" => "S",
            "float" => "F",
            "double" => "D",
            _ => "V",
        }
        .to_string(),
        Type::Class(name, _) => format!("L{};", names::binary(context, &name).replace('.', "/")),
        _ => "Ljava/lang/Object;".to_string(),
    }
}

/// Whether javac gives the constructors of a class of the file parameters the source does not show (the instance
/// around an inner class, the values a local class captures): such a constructor matches no row.
fn hidden_parameters(context: &Context, class: &str) -> bool {
    context.classes.get(class).is_some_and(|declaration| {
        crate::java::javac::instance_around(context.resolver, *declaration).is_some() || crate::java::javac::declared_locally(*declaration)
    })
}

/// The sink a call, `new` or `this(...)`/`super(...)` is, if any. An anonymous class's `new` is the call of the
/// superclass constructor that javac writes in the anonymous class's constructor.
pub fn sink(context: &Context, node: Node, own: &str) -> Option<Sink> {
    let call = match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node)?,
        "object_creation_expression" => context.resolver.resolve_constructor(node)?,
        "explicit_constructor_invocation" => context.resolver.resolve_delegation(node)?,
        _ => return None,
    };
    if node.kind() == "object_creation_expression" && hidden_parameters(context, &call.declaring) {
        return None;
    }
    let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
    let name = if node.kind() == "method_invocation" { call.method.name.clone() } else { "<init>".to_string() };
    let class = owner(context, node, own, &call);
    let (pattern, positions) = row(context, &class, &name, &parameters.join(","))?;
    let given: String = call.method.parameters.iter().map(|kind| descriptor(context, kind)).collect();
    let returned = if name == "<init>" { "V".to_string() } else { descriptor(context, &call.method.returns) };
    let named = format!("{}.{name}({given}){returned}", names::binary(context, &class).replace('.', "/"));
    Some(Sink { pattern, positions, named })
}

/// The finding's message, as FindSecBugs words it for the pattern.
pub fn message(pattern: &str, named: &str) -> String {
    match pattern {
        "PATH_TRAVERSAL_IN" => format!("This API ({named}) reads a file whose location might be specified by user input"),
        "PATH_TRAVERSAL_OUT" => format!("This API ({named}) writes to a file whose location might be specified by user input"),
        "SQL_INJECTION_JDBC" => format!("This use of {named} can be vulnerable to SQL injection (with JDBC)"),
        "SQL_INJECTION_SPRING_JDBC" => format!("This use of {named} can be vulnerable to SQL injection (with Spring JDBC)"),
        "SQL_INJECTION_JPA" => format!("This use of {named} can be vulnerable to SQL/JPQL injection (with JPA)"),
        "COMMAND_INJECTION" => format!("This usage of {named} can be vulnerable to Command Injection"),
        _ => format!("This use of {named} can be vulnerable to LDAP injection"),
    }
}
