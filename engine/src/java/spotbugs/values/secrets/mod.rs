//! HARD_CODE_PASSWORD and HARD_CODE_KEY, as four FindSecBugs 1.14.0 detectors report them, rebuilt from lab runs.
//!
//! ConstantPasswordDetector follows hard-coded values through each class, method by method: the static initializer
//! first, then the constructors and methods in class-file order, then the lambdas. A hard-coded value is a string
//! constant, or a `char[]`, `byte[]` or `BigInteger` made from constants (`flow`). A field given such an array or
//! number holds a hard-coded value for the methods visited after the store. The detector reports:
//! - a hard-coded argument at a checked position of a JDK call of `sinks.tsv`, at priority 1;
//! - once per class, at priority 2 on the class, the fields with a suspicious name the class stores a hard-coded
//!   array or number in: HARD_CODE_PASSWORD when one of them is a `char[]`, HARD_CODE_KEY otherwise.
//!
//! The other three report HARD_CODE_PASSWORD at priority 2 on the calling method (`named`): a setter for a password,
//! a map entry whose key names a password, and the passphrase of `JSch.addIdentity`.
mod fields;
mod flow;
mod named;
mod calls;

use super::super::{Context, place};
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const PASSWORD: &str = "HARD_CODE_PASSWORD";
pub const KEY: &str = "HARD_CODE_KEY";
pub const PATTERNS: &[&str] = &[PASSWORD, KEY];

/// Parts of a field name that make it suspicious, in any case.
const SUSPICIOUS: &[&str] = &["pass", "pwd", "psw", "secret", "key", "cipher", "crypt", "des", "aes", "mac", "cert", "sign"];

pub fn suspicious(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    SUSPICIOUS.iter().any(|part| lower.contains(part))
}

/// What a hard-coded array or number is used as.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A `char[]`.
    Chars,
    /// A `byte[]`.
    Bytes,
    /// A `BigInteger`.
    Number,
}

impl Kind {
    pub fn of(kind: &Type) -> Option<Kind> {
        match kind {
            Type::Array(element) if **element == Type::Primitive("char") => Some(Kind::Chars),
            Type::Array(element) if **element == Type::Primitive("byte") => Some(Kind::Bytes),
            Type::Class(name, _) if name == "java.math.BigInteger" => Some(Kind::Number),
            _ => None,
        }
    }
}

/// How hard-coded a value is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Hard {
    No,
    Null,
    /// A string constant; `None` when the paths into a local give different ones.
    Text(Option<String>),
    Marked(Kind),
}

/// Where SpotBugs says a value comes from: the call that made it or the field it was read from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Origin {
    None,
    Call(String),
    Field(String, String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Held {
    pub hard: Hard,
    pub origin: Origin,
}

impl Held {
    pub const NO: Held = Held { hard: Hard::No, origin: Origin::None };

    pub fn plain(hard: Hard) -> Held {
        Held { hard, origin: Origin::None }
    }

    /// The value of a local over two paths: hard-coded only when both are.
    pub fn merge(&self, other: &Held) -> Held {
        let hard = match (&self.hard, &other.hard) {
            (Hard::Text(one), Hard::Text(two)) => Hard::Text(one.clone().filter(|_| one == two)),
            (Hard::Marked(one), Hard::Marked(two)) if one == two => Hard::Marked(*one),
            (Hard::Null, Hard::Null) => Hard::Null,
            _ => Hard::No,
        };
        let origin = if self.origin == other.origin { self.origin.clone() } else { Origin::None };
        Held { hard, origin }
    }
}

pub fn secrets<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    if !context.wants(PATTERNS) {
        return;
    }
    let summaries = fields::Summaries::of(context);
    for class in declared {
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { continue };
        let marked = flow::visit(context, &summaries, &own, *class);
        report_fields(context, &own, *class, &marked);
        named::named(context, &own, *class);
    }
}

/// The finding about the suspicious fields a class stores hard-coded arrays or numbers in.
fn report_fields(context: &Context, own: &str, class: Node, marked: &[(String, String, Kind)]) {
    let named: Vec<&(String, String, Kind)> = marked.iter().filter(|(_, name, _)| suspicious(name)).collect();
    if named.is_empty() {
        return;
    }
    let Some(body) = class.child_by_field_name("body").or_else(|| crate::engine::source::children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let members = place::members(body);
    let first = super::super::lombok::compiled(context, own).and_then(|compiled| compiled.first_line()).or_else(|| super::super::classes::lines::class_first(context, own, class, &members));
    let Some(first) = first else { return };
    let (pattern, message) = if named.iter().any(|(_, _, kind)| *kind == Kind::Chars) { (PASSWORD, "Hard coded password found") } else { (KEY, "Hard coded cryptographic key found") };
    context.report_listed(pattern, class, first, message.to_string(), place::class(context, own), 2, Vec::new());
}
