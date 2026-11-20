//! The standard functions PMD rules call, and PMD's own Java functions.
use crate::java::fields::Fields;
use super::eval::{Focus, Machine};
use super::value::{Env, Item, Seq};
use crate::java::pmd::tree::Value;
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use regex::Regex;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

thread_local! {
    static REGEXES: RefCell<HashMap<(String, String), Option<Rc<Regex>>>> = RefCell::new(HashMap::new());
}

/// Time spent finding types and calls for the rules, over all threads.
pub static TYPE_NANOS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
thread_local! {
    static TYPING: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

/// An XPath regular expression in the syntax of the regex crate.
fn translated(pattern: &str, flags: &str) -> String {
    if flags.contains('q') {
        return format!("{}{}", if flags.contains('i') { "(?i)" } else { "" }, regex::escape(pattern));
    }
    let mut out = String::with_capacity(pattern.len() + 8);
    let kept: String = flags.chars().filter(|flag| matches!(flag, 'i' | 's' | 'm' | 'x')).collect();
    if !kept.is_empty() {
        out.push_str(&format!("(?{kept})"));
    }
    let chars: Vec<char> = pattern.chars().collect();
    let (mut at, mut depth) = (0, 0);
    while at < chars.len() {
        let c = chars[at];
        match c {
            // A word character in XPath is anything but punctuation, separators and control characters: `_` is not one.
            '\\' if matches!(chars.get(at + 1), Some('w' | 'W')) => {
                out.push_str(if chars[at + 1] == 'w' { "[^\\p{P}\\p{Z}\\p{C}]" } else { "[\\p{P}\\p{Z}\\p{C}]" });
                at += 1;
            }
            // White space in XPath is space, tab, line feed and carriage return only.
            '\\' if matches!(chars.get(at + 1), Some('s' | 'S')) => {
                out.push_str(if chars[at + 1] == 's' { "[ \\t\\n\\r]" } else { "[^ \\t\\n\\r]" });
                at += 1;
            }
            '\\' => {
                out.push(c);
                if let Some(next) = chars.get(at + 1) {
                    out.push(*next);
                    at += 1;
                }
            }
            '[' if depth > 0 && chars.get(at + 1) != Some(&':') && chars.get(at.wrapping_sub(1)) != Some(&'-') => out.push_str("\\["),
            '[' => {
                depth += 1;
                out.push(c);
                if chars.get(at + 1) == Some(&'^') {
                    out.push('^');
                    at += 1;
                }
                if chars.get(at + 1) == Some(&']') {
                    out.push_str("\\]");
                    at += 1;
                }
            }
            ']' if depth > 0 => {
                depth -= 1;
                out.push(c);
            }
            '&' | '~' if depth > 0 && chars.get(at + 1) == Some(&c) => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
        at += 1;
    }
    out
}

fn regex(pattern: &str, flags: &str) -> Option<Rc<Regex>> {
    REGEXES.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(known) = cache.get(&(pattern.to_string(), flags.to_string())) {
            return known.clone();
        }
        let built = Regex::new(&translated(pattern, flags)).ok().map(Rc::new);
        cache.insert((pattern.to_string(), flags.to_string()), built.clone());
        built
    })
}

/// An XPath replacement string in the syntax of the regex crate.
fn replacement(written: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = written.chars().collect();
    let mut at = 0;
    while at < chars.len() {
        match chars[at] {
            '\\' if at + 1 < chars.len() => {
                at += 1;
                if chars[at] == '$' {
                    out.push_str("$$");
                } else {
                    out.push(chars[at]);
                }
            }
            '$' if chars.get(at + 1).is_some_and(char::is_ascii_digit) => {
                out.push_str(&format!("${{{}}}", chars[at + 1]));
                at += 1;
            }
            other => out.push(other),
        }
        at += 1;
    }
    out
}

struct Signature {
    owner: String,
    name: String,
    /// Parameter types; `None` when any parameters do.
    parameters: Option<Vec<String>>,
}

thread_local! {
    static SIGNATURES: RefCell<HashMap<String, Option<Rc<Signature>>>> = RefCell::new(HashMap::new());
}

fn signature(written: &str) -> Option<Rc<Signature>> {
    SIGNATURES.with(|cache| {
        cache
            .borrow_mut()
            .entry(written.to_string())
            .or_insert_with(|| {
                // A nested class may be written the binary way (`Map$Entry`); the index names it `Map.Entry`.
                let compact: String = written.split_whitespace().collect::<String>().replace('$', ".");
                let (owner, rest) = compact.split_once('#')?;
                let (name, parameters) = rest.strip_suffix(')')?.split_once('(')?;
                let parameters = match parameters {
                    "_*" => None,
                    "" => Some(Vec::new()),
                    listed => Some(listed.split(',').map(str::to_string).collect()),
                };
                Some(Rc::new(Signature { owner: owner.to_string(), name: name.to_string(), parameters }))
            })
            .clone()
    })
}

const TYPE_NODES: &[&str] = &["ClassType", "PrimitiveType", "ArrayType", "IntersectionType", "UnionType", "WildcardType", "VoidType"];
/// The nodes PMD gives a type, next to the type nodes above.
const TYPED: &[&str] = &[
    "VariableAccess", "MethodCall", "VariableId", "FormalParameter", "TypeExpression", "StringLiteral", "InfixExpression", "FieldAccess",
    "NumericLiteral", "ConstructorCall", "AssignmentExpression", "ThisExpression", "LambdaExpression", "ClassDeclaration", "LambdaParameter",
    "Annotation", "MethodReference", "NullLiteral", "UnaryExpression", "BooleanLiteral", "ClassLiteral", "ArrayAccess", "CastExpression",
    "ConditionalExpression", "RecordComponent", "PatternExpression", "TypePattern", "RecordPattern", "CharLiteral", "RecordDeclaration",
    "EnumConstant", "ArrayAllocation", "AnonymousClassDeclaration", "ArrayInitializer", "EnumDeclaration", "SwitchExpression",
    "AnnotationTypeDeclaration", "SuperExpression", "ExplicitConstructorInvocation", "TypeParameter", "TemplateExpression",
];

/// What a call looks like to matchesSig.
pub struct CallFacts {
    pub qualifier: Type,
    pub exact: bool,
    pub name: String,
    pub formals: Vec<Type>,
}

impl<'a, 't> Machine<'a, 't> {
    fn kind_is(&self, kind: &Type, name: &str) -> bool {
        match kind {
            Type::Class(actual, _) => self.resolver.index.is_subtype(actual, name),
            Type::Array(element) => match name.strip_suffix("[]") {
                Some(inner) => match element.as_ref() {
                    Type::Primitive(primitive) => *primitive == inner,
                    other => self.kind_is(other, inner),
                },
                None => matches!(name, "java.lang.Object" | "java.lang.Cloneable" | "java.io.Serializable"),
            },
            Type::Null => name.contains('.') || name.ends_with("[]"),
            other => other.erased().name() == name,
        }
    }

    /// The type PMD gives a node of the tree.
    pub fn node_type(&self, id: u32) -> Option<Type> {
        if let Some(known) = self.types.borrow().get(&id) {
            return known.clone();
        }
        let started = std::time::Instant::now();
        let depth = TYPING.with(|depth| depth.replace(depth.get() + 1));
        let found = self.find_type(id);
        TYPING.with(|at| at.set(depth));
        if depth == 0 {
            TYPE_NANOS.fetch_add(started.elapsed().as_nanos() as u64, std::sync::atomic::Ordering::Relaxed);
        }
        self.types.borrow_mut().insert(id, found.clone());
        found
    }

    fn find_type(&self, id: u32) -> Option<Type> {
        let tree = self.tree;
        let node = &tree.nodes[id as usize];
        if !TYPED.contains(&node.name) && !TYPE_NODES.contains(&node.name) {
            return None;
        }
        let child = |names: &[&str]| node.children.iter().copied().find(|kid| names.contains(&tree.nodes[*kid as usize].name));
        match node.name {
            "ArrayType" => {
                let element = self.node_type(*node.children.first()?)?;
                let depth = child(&["ArrayDimensions"]).map_or(1, |dims| tree.nodes[dims as usize].children.len());
                Some((0..depth).fold(element, |kind, _| Type::Array(Box::new(kind))))
            }
            "IntersectionType" => self.node_type(*node.children.first()?),
            "UnionType" => {
                let mut parts = node.children.iter().filter_map(|kid| self.node_type(*kid));
                let first = parts.next()?;
                Some(parts.fold(first, |joined, next| self.resolver.shared(&joined, &next)))
            }
            name if TYPE_NODES.contains(&name) => {
                let source = node.source?;
                self.resolver.type_node(source).or_else(|| match self.resolver.receiver(source)? {
                    Receiver::Static(name) => Some(Type::class(&name)),
                    Receiver::Value(_) => None,
                })
            }
            "TypeExpression" | "Annotation" | "PatternExpression" => self.node_type(*node.children.first()?),
            "TypePattern" | "RecordPattern" => self.node_type(child(TYPE_NODES)?),
            "TypeParameter" => Some(child(TYPE_NODES).and_then(|bound| self.node_type(bound)).unwrap_or(Type::class("java.lang.Object"))),
            "ExplicitConstructorInvocation" => self.resolver.call_formals(node.source?).map(|(call, _)| call.receiver),
            "SwitchExpression" => self.switch_type(id),
            "ClassDeclaration" | "EnumDeclaration" | "RecordDeclaration" | "AnnotationTypeDeclaration" | "AnonymousClassDeclaration" => {
                let source = node.source?;
                let names = &self.resolver.scope.names;
                names.get(&source.id()).or_else(|| names.get(&crate::engine::source::parent(source)?.id())).map(|name| Type::class(name))
            }
            "EnumConstant" => {
                let mut holder = node.parent;
                while holder != crate::java::pmd::tree::ROOT && tree.nodes[holder as usize].name != "EnumDeclaration" {
                    holder = tree.nodes[holder as usize].parent;
                }
                if holder == crate::java::pmd::tree::ROOT { None } else { self.node_type(holder) }
            }
            "FormalParameter" | "LambdaParameter" | "RecordComponent" => {
                self.node_type(child(&["VariableId"])?)
            }
            "VariableId" => {
                let mut holder = node.parent;
                if holder != crate::java::pmd::tree::ROOT && tree.nodes[holder as usize].name == "VariableDeclarator" {
                    holder = tree.nodes[holder as usize].parent;
                }
                let written = (holder != crate::java::pmd::tree::ROOT)
                    .then(|| tree.nodes[holder as usize].children.iter().copied().find(|kid| TYPE_NODES.contains(&tree.nodes[*kid as usize].name)))
                    .flatten();
                match written {
                    Some(written) => {
                        let mut kind = self.node_type(written)?;
                        let extra = child(&["ArrayDimensions"]).map_or(0, |dims| tree.nodes[dims as usize].children.len());
                        for _ in 0..extra {
                            kind = Type::Array(Box::new(kind));
                        }
                        Some(kind)
                    }
                    None => match node.source.and_then(|source| self.resolver.receiver(source)) {
                        Some(Receiver::Value(kind)) => Some(kind),
                        Some(Receiver::Static(_)) => None,
                        // `var name = value`: the type of the value.
                        None => {
                            let declarator = &tree.nodes[node.parent as usize];
                            let value = declarator.children.get(1).filter(|_| declarator.name == "VariableDeclarator")?;
                            self.node_type(*value)
                        }
                    },
                }
            }
            "VariableAccess" | "FieldAccess" => match self.resolver.receiver(node.source?)? {
                Receiver::Value(kind) => Some(kind),
                Receiver::Static(_) => None,
            },
            "NullLiteral" => Some(Type::Null),
            _ => self.resolver.type_of(node.source?),
        }
    }

    /// A switch expression has the type its branches agree on: the same type, or the wider number.
    fn switch_type(&self, id: u32) -> Option<Type> {
        let tree = self.tree;
        let mut results = Vec::new();
        let mut stack: Vec<u32> = tree.nodes[id as usize].children.iter().skip(1).copied().collect();
        while let Some(at) = stack.pop() {
            let node = &tree.nodes[at as usize];
            match node.name {
                "SwitchArrowBranch" => match node.children.last().map(|last| (*last, tree.nodes[*last as usize].name)) {
                    Some((_, "ThrowStatement")) => {}
                    Some((block, "Block")) => stack.push(block),
                    Some((value, _)) => results.push(value),
                    None => {}
                },
                "YieldStatement" => results.extend(node.children.first().copied()),
                "SwitchExpression" | "LambdaExpression" | "ClassBody" | "SwitchLabel" => {}
                _ => stack.extend(node.children.iter().copied()),
            }
        }
        let mut kinds = results.into_iter().filter_map(|value| self.node_type(value)).filter(|kind| !matches!(kind, Type::Null));
        let first = kinds.next()?;
        Some(kinds.fold(first, |joined, next| match (&joined, &next) {
            (a, b) if a == b => joined,
            (Type::Primitive(a), Type::Primitive(b)) => {
                let rank = |name: &str| ["byte", "short", "char", "int", "long", "float", "double"].iter().position(|known| *known == name);
                if rank(a) >= rank(b) { joined } else { next }
            }
            (Type::Class(..), Type::Class(..)) => self.resolver.shared(&joined, &next),
            _ => joined,
        }))
    }

    pub(super) fn type_is(&self, focus: &Focus, name: &str, exactly: bool) -> bool {
        let Some(Item::Node(id)) = focus.item else { return false };
        let Some(kind) = self.node_type(*id) else { return false };
        let dotted = name.replace('$', ".");
        let name = dotted.as_str();
        if exactly {
            // A type variable is exactly no class, not even the class it erases to.
            return !matches!(kind, Type::Null | Type::Variable(_) | Type::Wildcard) && kind.erased().name() == name;
        }
        self.kind_is(&kind, name)
    }

    /// The method a call node resolves to, as matchesSig looks at it.
    pub fn call_facts(&self, id: u32) -> Option<Rc<CallFacts>> {
        if let Some(known) = self.calls.borrow().get(&id) {
            return known.clone();
        }
        let started = std::time::Instant::now();
        let depth = TYPING.with(|depth| depth.replace(depth.get() + 1));
        let found = self.find_call(id).map(Rc::new);
        TYPING.with(|at| at.set(depth));
        if depth == 0 {
            TYPE_NANOS.fetch_add(started.elapsed().as_nanos() as u64, std::sync::atomic::Ordering::Relaxed);
        }
        self.calls.borrow_mut().insert(id, found.clone());
        found
    }

    fn find_call(&self, id: u32) -> Option<CallFacts> {
        let node = &self.tree.nodes[id as usize];
        let source = node.source?;
        let created = match (node.name, source.kind()) {
            ("MethodCall", "method_invocation") => false,
            ("ConstructorCall", "object_creation_expression") => true,
            ("EnumConstant", "enum_constant") | ("ExplicitConstructorInvocation", "explicit_constructor_invocation") => true,
            _ => return None,
        };
        let name = if created { "new" } else { source.field("name").map(|name| self.file.text_of(name)).unwrap_or_default() };
        let (call, formals) = self.resolver.call_formals(source)?;
        let qualifier = if created {
            Type::class(&call.declaring)
        } else {
            match source.field("object") {
                Some(_) => node.children.first().and_then(|first| self.node_type(*first)).unwrap_or(call.receiver.clone()),
                None => Type::class(&call.declaring),
            }
        };
        Some(CallFacts { qualifier, exact: created || call.method.is_static, name: name.to_string(), formals })
    }

    fn matches_sig(&self, focus: &Focus, written: &str) -> bool {
        let Some(Item::Node(id)) = focus.item else { return false };
        let node = &self.tree.nodes[*id as usize];
        let (Some(source), Some(wanted)) = (node.source, signature(written)) else { return false };
        if !matches!(node.name, "MethodCall" | "ConstructorCall" | "EnumConstant" | "ExplicitConstructorInvocation") {
            return false;
        }
        if wanted.name != "_" {
            let name = if node.name != "MethodCall" { Some("new") } else { source.field("name").map(|name| self.file.text_of(name)) };
            if name != Some(wanted.name.as_str()) {
                return false;
            }
        }
        let given = source.field("arguments").map_or(0, |list| {
            let mut cursor = list.walk();
            list.named_children(&mut cursor).filter(|kid| !kid.kind().ends_with("comment")).count()
        });
        if wanted.parameters.as_ref().is_some_and(|parameters| parameters.len() != given) {
            return false;
        }
        let Some(call) = self.call_facts(*id) else { return false };
        if wanted.owner != "_" {
            let fits = if call.exact { call.qualifier.erased().name() == wanted.owner } else { self.kind_is(&call.qualifier, &wanted.owner) };
            if !fits {
                return false;
            }
        }
        match &wanted.parameters {
            None => true,
            Some(parameters) => {
                parameters.len() == call.formals.len()
                    && parameters.iter().zip(&call.formals).all(|(want, formal)| want == "_" || formal.erased().name() == *want)
            }
        }
    }

    fn modifiers(&self, focus: &Focus, key: &str) -> Seq {
        let Some(Item::Node(id)) = focus.item else { return Seq::Empty };
        let Some(owner) = self.modifier_owner(*id) else { return Seq::Empty };
        let list = self.tree.nodes[owner as usize].children.iter().copied().find(|kid| self.tree.nodes[*kid as usize].name == "ModifierList");
        match list.and_then(|list| self.tree.attribute(self.file, list, key)) {
            Some(Value::List(all)) => Seq::from(all.iter().map(|entry| Item::text(entry)).collect()),
            _ => Seq::Empty,
        }
    }

    fn name_of(&self, item: Option<&Item>) -> String {
        match item {
            Some(Item::Node(id)) => self.tree.nodes[*id as usize].name.to_string(),
            Some(Item::Attr(_, key)) => key.to_string(),
            Some(Item::Xml(xml)) => xml.name.to_string(),
            _ => String::new(),
        }
    }

    fn numbers(&self, seq: &Seq) -> Vec<Item> {
        self.atoms(seq)
    }

    fn extreme(&self, seq: &Seq, largest: bool) -> Seq {
        let atoms = self.numbers(seq);
        let mut best: Option<Item> = None;
        for atom in atoms {
            best = Some(match best {
                None => atom,
                Some(current) => {
                    let order = self.compare(&atom, &current).unwrap_or(std::cmp::Ordering::Equal);
                    if (order == std::cmp::Ordering::Greater) == largest && order != std::cmp::Ordering::Equal { atom } else { current }
                }
            });
        }
        best.map_or(Seq::Empty, Seq::One)
    }

    fn rounded(&self, seq: &Seq, round: fn(f64) -> f64) -> Seq {
        match self.atoms(seq).first() {
            Some(Item::Whole(whole)) => Seq::whole(*whole),
            Some(other) => Seq::One(Item::Real(round(self.number_of(other)))),
            None => Seq::Empty,
        }
    }

    pub fn call(&self, name: &str, arguments: Vec<Seq>, focus: &Focus, env: &mut Env) -> Seq {
        let own = || focus.item.map_or(Seq::Empty, |item| Seq::One(item.clone()));
        let text = |at: usize| match arguments.get(at) {
            Some(argument) if argument.len() > 1 => {
                self.fail(|| format!("a sequence of more than one item as argument {} of {name}()", at + 1));
                String::new()
            }
            Some(argument) => self.string(argument),
            None => String::new(),
        };
        let subject = |at: usize| match arguments.get(at) {
            Some(_) => text(at),
            None => self.string(&own()),
        };
        let pattern = |at: usize, flags: usize| {
            let (pattern, flags) = (text(at), text(flags));
            let built = regex(&pattern, &flags);
            if built.is_none() {
                self.fail(|| format!("regular expression not understood: {pattern}"));
            }
            built
        };
        match (name, arguments.len()) {
            ("pmd-java:typeIs", 1) => Seq::flag(self.type_is(focus, &text(0), false)),
            ("pmd-java:typeIsExactly", 1) => Seq::flag(self.type_is(focus, &text(0), true)),
            ("pmd-java:matchesSig", 1) => Seq::flag(self.matches_sig(focus, &text(0))),
            ("pmd-java:modifiers", 0) => self.modifiers(focus, "EffectiveModifiers"),
            ("pmd-java:explicitModifiers", 0) => self.modifiers(focus, "ExplicitModifiers"),
            ("pmd-java:hasAnnotation", 1) => Seq::flag(self.has_annotation(focus, &text(0))),
            ("pmd-java:nodeIs", 1) => Seq::flag(self.node_is(focus, &text(0))),
            ("true", 0) => Seq::flag(true),
            ("false", 0) => Seq::flag(false),
            ("not", 1) => Seq::flag(!self.truth(&arguments[0])),
            ("boolean", 1) => Seq::flag(self.truth(&arguments[0])),
            ("exists", 1) => Seq::flag(!arguments[0].is_empty()),
            ("empty", 1) => Seq::flag(arguments[0].is_empty()),
            ("count", 1) => Seq::whole(arguments[0].len() as i64),
            ("position", 0) => Seq::whole(focus.position as i64),
            ("last", 0) => Seq::whole(focus.size as i64),
            ("string", 0 | 1) => Seq::owned(subject(0)),
            ("xs:string", 1) => {
                if arguments[0].is_empty() { Seq::Empty } else { Seq::owned(text(0)) }
            }
            ("data", 1) => Seq::from(self.atoms(&arguments[0])),
            ("number" | "xs:double" | "xs:decimal" | "xs:float", 0 | 1) => {
                let from = if arguments.is_empty() { own() } else { arguments[0].clone() };
                match self.atoms(&from).first() {
                    Some(atom) => Seq::One(Item::Real(self.number_of(atom))),
                    None if name == "number" => Seq::One(Item::Real(f64::NAN)),
                    None => Seq::Empty,
                }
            }
            ("xs:integer" | "xs:int" | "xs:long", 1) => match self.atoms(&arguments[0]).first() {
                Some(Item::Whole(whole)) => Seq::whole(*whole),
                Some(Item::Text(written)) => match written.trim().parse::<i64>() {
                    Ok(whole) => Seq::whole(whole),
                    Err(_) => self.fail(|| format!("not a whole number: {written}")),
                },
                Some(other) => Seq::whole(self.number_of(other).trunc() as i64),
                None => Seq::Empty,
            },
            ("xs:boolean", 1) => match self.atoms(&arguments[0]).first() {
                Some(Item::Text(written)) => Seq::flag(matches!(written.trim(), "true" | "1")),
                Some(other) => Seq::flag(self.truth(&Seq::One(other.clone()))),
                None => Seq::Empty,
            },
            ("name" | "local-name", 0) => Seq::owned(self.name_of(focus.item)),
            ("name" | "local-name", 1) => Seq::owned(self.name_of(arguments[0].items().first())),
            ("root", 0 | 1) => {
                let from = if arguments.is_empty() { own() } else { arguments[0].clone() };
                match from.items().first() {
                    Some(Item::Node(_) | Item::Attr(..) | Item::Doc) => Seq::One(Item::Doc),
                    Some(other) => Seq::One(other.clone()),
                    None => Seq::Empty,
                }
            }
            ("concat", _) => Seq::owned((0..arguments.len()).map(text).collect()),
            ("string-join", 1 | 2) => {
                let parts: Vec<String> = self.atoms(&arguments[0]).iter().map(|atom| self.string_of(atom)).collect();
                Seq::owned(parts.join(&text(1)))
            }
            ("starts-with", 2) => Seq::flag(text(0).starts_with(&text(1))),
            ("ends-with", 2) => Seq::flag(text(0).ends_with(&text(1))),
            ("contains", 2) => Seq::flag(text(0).contains(&text(1))),
            ("substring-before", 2) => Seq::owned(text(0).split_once(&text(1)).filter(|_| !text(1).is_empty()).map_or(String::new(), |(before, _)| before.to_string())),
            ("substring-after", 2) => {
                let (whole, cut) = (text(0), text(1));
                Seq::owned(if cut.is_empty() { whole } else { whole.split_once(&cut).map_or(String::new(), |(_, after)| after.to_string()) })
            }
            ("substring", 2 | 3) => {
                let whole = text(0);
                let start = self.number_of(arguments[1].items().first().unwrap_or(&Item::Whole(1))).round();
                let end = match arguments.get(2) {
                    Some(length) => start + self.number_of(length.items().first().unwrap_or(&Item::Whole(0))).round(),
                    None => f64::INFINITY,
                };
                Seq::owned(whole.chars().enumerate().filter(|(at, _)| (*at as f64 + 1.0) >= start && (*at as f64 + 1.0) < end).map(|(_, c)| c).collect())
            }
            ("string-length", 0 | 1) => Seq::whole(subject(0).chars().count() as i64),
            ("lower-case", 1) => Seq::owned(text(0).to_lowercase()),
            ("upper-case", 1) => Seq::owned(text(0).to_uppercase()),
            ("normalize-space", 0 | 1) => Seq::owned(subject(0).split_whitespace().collect::<Vec<_>>().join(" ")),
            ("translate", 3) => {
                let (from, to): (Vec<char>, Vec<char>) = (text(1).chars().collect(), text(2).chars().collect());
                Seq::owned(
                    text(0)
                        .chars()
                        .filter_map(|c| match from.iter().position(|known| *known == c) {
                            Some(at) => to.get(at).copied(),
                            None => Some(c),
                        })
                        .collect(),
                )
            }
            ("compare", 2) => {
                if arguments[0].is_empty() || arguments[1].is_empty() {
                    return Seq::Empty;
                }
                Seq::whole(text(0).cmp(&text(1)) as i64)
            }
            ("string-to-codepoints", 1) => Seq::from(text(0).chars().map(|c| Item::Whole(c as i64)).collect()),
            ("codepoints-to-string", 1) => {
                Seq::owned(self.atoms(&arguments[0]).iter().filter_map(|atom| char::from_u32(self.number_of(atom) as u32)).collect())
            }
            ("matches", 2 | 3) => match regex(&text(1), &text(2)) {
                Some(built) => Seq::flag(built.is_match(&text(0))),
                None => match super::extra::backtracking_match(&translated(&text(1), &text(2)), &text(0)) {
                    Some(matched) => Seq::flag(matched),
                    None => {
                        self.fail(|| format!("regular expression not understood: {}", text(1)));
                        Seq::flag(false)
                    }
                },
            },
            ("replace", 3 | 4) => match pattern(1, 3) {
                Some(built) => Seq::owned(built.replace_all(&text(0), replacement(&text(2)).as_str()).into_owned()),
                None => Seq::owned(text(0)),
            },
            ("tokenize", 1) => Seq::from(text(0).split_whitespace().map(Item::text).collect()),
            ("tokenize", 2 | 3) => {
                let whole = text(0);
                if whole.is_empty() {
                    return Seq::Empty;
                }
                match pattern(1, 2) {
                    Some(built) => Seq::from(built.split(&whole).map(Item::text).collect()),
                    None => Seq::Empty,
                }
            }
            ("analyze-string", 2 | 3) => {
                let whole = text(0);
                let Some(built) = pattern(1, 2) else { return Seq::Empty };
                let mut parts = Vec::new();
                let mut at = 0;
                for found in built.captures_iter(&whole) {
                    let all = found.get(0).expect("whole match");
                    if all.start() > at {
                        parts.push(Machine::xml("non-match", &whole[at..all.start()], None, Vec::new()));
                    }
                    let groups = (1..found.len())
                        .filter_map(|number| found.get(number).map(|group| Machine::xml("group", group.as_str(), Some(number as i64), Vec::new())))
                        .collect();
                    parts.push(Machine::xml("match", all.as_str(), None, groups));
                    at = all.end();
                }
                if at < whole.len() {
                    parts.push(Machine::xml("non-match", &whole[at..], None, Vec::new()));
                }
                Seq::One(Item::Xml(Machine::xml("analyze-string-result", &whole, None, parts)))
            }
            ("distinct-values", 1) => {
                let mut kept: Vec<Item> = Vec::new();
                for atom in self.atoms(&arguments[0]) {
                    if !kept.iter().any(|known| self.same(known, &atom)) {
                        kept.push(atom);
                    }
                }
                Seq::from(kept)
            }
            ("sort", 1) => {
                let mut all = self.atoms(&arguments[0]);
                let numeric = all.iter().all(|atom| matches!(atom, Item::Whole(_) | Item::Real(_)));
                if numeric {
                    all.sort_by(|a, b| self.number_of(a).total_cmp(&self.number_of(b)));
                } else {
                    all.sort_by_cached_key(|atom| self.string(&Seq::One(atom.clone())));
                }
                Seq::from(all)
            }
            ("reverse", 1) => {
                let mut all = arguments[0].clone().into_vec();
                all.reverse();
                Seq::from(all)
            }
            ("head", 1) => arguments[0].items().first().map_or(Seq::Empty, |first| Seq::One(first.clone())),
            ("tail", 1) => Seq::from(arguments[0].items().iter().skip(1).cloned().collect()),
            ("subsequence", 2 | 3) => {
                let start = self.number_of(arguments[1].items().first().unwrap_or(&Item::Whole(1))).round();
                let end = match arguments.get(2) {
                    Some(length) => start + self.number_of(length.items().first().unwrap_or(&Item::Whole(0))).round(),
                    None => f64::INFINITY,
                };
                let items = arguments[0].items().iter().enumerate();
                Seq::from(items.filter(|(at, _)| (*at as f64 + 1.0) >= start && (*at as f64 + 1.0) < end).map(|(_, item)| item.clone()).collect())
            }
            ("index-of", 2) => {
                let wanted = self.atoms(&arguments[1]);
                let Some(wanted) = wanted.first() else { return Seq::Empty };
                let atoms = self.atoms(&arguments[0]);
                Seq::from(atoms.iter().enumerate().filter(|(_, atom)| self.same(atom, wanted)).map(|(at, _)| Item::Whole(at as i64 + 1)).collect())
            }
            ("insert-before", 3) => {
                let mut all = arguments[0].clone().into_vec();
                let at = (self.number_of(arguments[1].items().first().unwrap_or(&Item::Whole(1))) as usize).clamp(1, all.len() + 1) - 1;
                all.splice(at..at, arguments[2].clone().into_vec());
                Seq::from(all)
            }
            ("remove", 2) => {
                let at = self.number_of(arguments[1].items().first().unwrap_or(&Item::Whole(0))) as usize;
                Seq::from(arguments[0].items().iter().enumerate().filter(|(index, _)| index + 1 != at).map(|(_, item)| item.clone()).collect())
            }
            ("exactly-one" | "zero-or-one" | "one-or-more" | "unordered", 1) => arguments[0].clone(),
            ("max", 1) => self.extreme(&arguments[0], true),
            ("min", 1) => self.extreme(&arguments[0], false),
            ("sum", 1 | 2) => {
                let atoms = self.atoms(&arguments[0]);
                if atoms.is_empty() {
                    return arguments.get(1).cloned().unwrap_or(Seq::whole(0));
                }
                if atoms.iter().all(|atom| matches!(atom, Item::Whole(_))) {
                    return Seq::whole(atoms.iter().map(|atom| if let Item::Whole(whole) = atom { *whole } else { 0 }).sum());
                }
                Seq::One(Item::Real(atoms.iter().map(|atom| self.number_of(atom)).sum()))
            }
            ("avg", 1) => {
                let atoms = self.atoms(&arguments[0]);
                if atoms.is_empty() {
                    return Seq::Empty;
                }
                Seq::One(Item::Real(atoms.iter().map(|atom| self.number_of(atom)).sum::<f64>() / atoms.len() as f64))
            }
            ("abs", 1) => match self.atoms(&arguments[0]).first() {
                Some(Item::Whole(whole)) => Seq::whole(whole.abs()),
                Some(other) => Seq::One(Item::Real(self.number_of(other).abs())),
                None => Seq::Empty,
            },
            ("floor", 1) => self.rounded(&arguments[0], f64::floor),
            ("ceiling", 1) => self.rounded(&arguments[0], f64::ceil),
            ("round", 1) => self.rounded(&arguments[0], |value| (value + 0.5).floor()),
            ("fold-left", 3) => {
                let Some(function) = arguments[2].items().first() else { return Seq::Empty };
                let mut total = arguments[1].clone();
                for item in arguments[0].items() {
                    total = self.apply(function, vec![total, Seq::One(item.clone())], env);
                }
                total
            }
            ("fold-right", 3) => {
                let Some(function) = arguments[2].items().first() else { return Seq::Empty };
                let mut total = arguments[1].clone();
                for item in arguments[0].items().iter().rev() {
                    total = self.apply(function, vec![Seq::One(item.clone()), total], env);
                }
                total
            }
            ("for-each", 2) => {
                let Some(function) = arguments[1].items().first() else { return Seq::Empty };
                let mut all = Vec::new();
                for item in arguments[0].items() {
                    all.extend(self.apply(function, vec![Seq::One(item.clone())], env).into_vec());
                }
                Seq::from(all)
            }
            ("filter", 2) => {
                let Some(function) = arguments[1].items().first() else { return Seq::Empty };
                let mut all = Vec::new();
                for item in arguments[0].items() {
                    if self.truth(&self.apply(function, vec![Seq::One(item.clone())], env)) {
                        all.push(item.clone());
                    }
                }
                Seq::from(all)
            }
            ("deep-equal", 2) => {
                let (left, right) = (self.atoms(&arguments[0]), self.atoms(&arguments[1]));
                Seq::flag(left.len() == right.len() && left.iter().zip(&right).all(|(a, b)| self.same(a, b)))
            }
            ("map:get", 2) | ("map:contains", 2) => {
                let key = self.atoms(&arguments[1]).into_iter().next();
                let found = match (arguments[0].items().first(), key) {
                    (Some(Item::Map(entries)), Some(key)) => entries.iter().find(|(known, _)| self.same(known, &key)).map(|(_, value)| value.clone()),
                    _ => None,
                };
                if name == "map:contains" { Seq::flag(found.is_some()) } else { found.unwrap_or(Seq::Empty) }
            }
            ("map:keys", 1) => match arguments[0].items().first() {
                Some(Item::Map(entries)) => Seq::from(entries.iter().map(|(key, _)| key.clone()).collect()),
                _ => Seq::Empty,
            },
            ("map:size", 1) => match arguments[0].items().first() {
                Some(Item::Map(entries)) => Seq::whole(entries.len() as i64),
                _ => Seq::Empty,
            },
            ("map:put", 3) => match (arguments[0].items().first(), self.atoms(&arguments[1]).into_iter().next()) {
                (Some(Item::Map(entries)), Some(key)) => {
                    let mut entries: Vec<(Item, Seq)> = entries.iter().filter(|(known, _)| !self.same(known, &key)).cloned().collect();
                    entries.push((key, arguments[2].clone()));
                    Seq::One(Item::Map(Rc::new(entries)))
                }
                _ => Seq::Empty,
            },
            ("map:merge", 1 | 2) => {
                let mut merged: Vec<(Item, Seq)> = Vec::new();
                for item in arguments[0].items() {
                    if let Item::Map(entries) = item {
                        for (key, value) in entries.iter() {
                            if !merged.iter().any(|(known, _)| self.same(known, key)) {
                                merged.push((key.clone(), value.clone()));
                            }
                        }
                    }
                }
                Seq::One(Item::Map(Rc::new(merged)))
            }
            ("map:entry", 2) => match self.atoms(&arguments[0]).into_iter().next() {
                Some(key) => Seq::One(Item::Map(Rc::new(vec![(key, arguments[1].clone())]))),
                None => Seq::Empty,
            },
            ("array:of", 1) => Seq::One(Item::Array(Rc::new(arguments[0].items().iter().map(|item| Seq::One(item.clone())).collect()))),
            ("array:size", 1) => match arguments[0].items().first() {
                Some(Item::Array(members)) => Seq::whole(members.len() as i64),
                _ => Seq::Empty,
            },
            ("array:get", 2) => match arguments[0].items().first() {
                Some(array @ Item::Array(_)) => self.apply(array, vec![arguments[1].clone()], env),
                _ => Seq::Empty,
            },
            _ => self.fail(|| format!("function {name} with {} arguments is not known", arguments.len())),
        }
    }
}
