//! CollectionIncompatibleType: an argument of `Collection.contains`, `Map.get` and the like whose type can never be
//! equal to the collection's type argument. Types are compared as Error Prone's TypeCompatibility compares them, after
//! capture conversion of the receiver: a wildcard becomes a fresh variable bounded by the wildcard and by the bound of
//! the type parameter it fills.
use super::Context;
use super::compat::{compatibility, qualified};
use super::javac_print::printed;
use super::junit_more::bounded;
use super::shape::{arguments, preferred};
use crate::java::types::model::{OBJECT, Type};
use crate::java::types::scope::{Resolver, enclosing_type};
use tree_sitter::Node;

const NAME: &str = "CollectionIncompatibleType";
const FIRST_ORDER: [&str; 5] = ["java.util.Collection", "java.util.Dictionary", "java.util.Map", "java.util.Collections", "com.google.common.collect.Sets"];
const COLLECTION: &str = "java.util.Collection";
const OBJ: &[&str] = &[OBJECT];

/// `MethodArgMatcher`: the class whose descendants it matches, the type argument, the method and its parameters.
const DIRECT: [(&str, usize, &str, &[&str]); 17] = [
    (COLLECTION, 0, "contains", OBJ),
    (COLLECTION, 0, "remove", OBJ),
    ("java.util.Deque", 0, "removeFirstOccurrence", OBJ),
    ("java.util.Deque", 0, "removeLastOccurrence", OBJ),
    ("java.util.Dictionary", 0, "get", OBJ),
    ("java.util.Dictionary", 0, "remove", OBJ),
    ("java.util.List", 0, "indexOf", OBJ),
    ("java.util.List", 0, "lastIndexOf", OBJ),
    ("java.util.Map", 0, "containsKey", OBJ),
    ("java.util.Map", 1, "containsValue", OBJ),
    ("java.util.Map", 0, "get", OBJ),
    ("java.util.Map", 0, "getOrDefault", &[OBJECT, OBJECT]),
    ("java.util.Map", 0, "remove", OBJ),
    ("java.util.Stack", 0, "search", OBJ),
    ("java.util.Vector", 0, "indexOf", &[OBJECT, "int"]),
    ("java.util.Vector", 0, "lastIndexOf", &[OBJECT, "int"]),
    ("java.util.Vector", 0, "removeElement", OBJ),
];
/// `TypeArgOfMethodArgMatcher`: methods of `Collection` taking a `Collection`.
const TYPE_ARG: [&str; 3] = ["containsAll", "removeAll", "retainAll"];
/// `BinopMatcher`: the collection type of both arguments, the class and the static method.
const STATIC: [(&str, &str, &str); 2] = [(COLLECTION, "java.util.Collections", "disjoint"), ("java.util.Set", "com.google.common.collect.Sets", "difference")];
const NAMES: [&str; 17] = [
    "contains", "remove", "removeFirstOccurrence", "removeLastOccurrence", "get", "indexOf", "lastIndexOf", "containsKey", "containsValue",
    "getOrDefault", "search", "removeElement", "containsAll", "removeAll", "retainAll", "disjoint", "difference",
];
const MARK: &str = "\u{1}capture";

/// The method a call or method reference names and the type of its receiver, as `getReceiverType` gives it.
struct Used {
    receiver: Type,
    method: String,
    is_static: bool,
    parameters: Vec<String>,
}

enum Message {
    Direct,
    TypeArg(Type),
    Binop,
}

struct Check<'c, 't> {
    context: &'c Context<'t>,
    printing: Resolver<'t>,
    node: Node<'t>,
    /// Fresh variables from capture conversion: how each prints and its upper bound.
    captured: std::cell::RefCell<Vec<(Type, Type)>>,
}

fn marker(kind: &Type) -> Option<usize> {
    match kind {
        Type::Variable(name) => name.strip_prefix(MARK).and_then(|at| at.parse().ok()),
        _ => None,
    }
}

impl<'t> Check<'_, 't> {
    fn fresh(&self, shown: Type, upper: Type) -> Type {
        let mut captured = self.captured.borrow_mut();
        captured.push((shown, upper));
        Type::Variable(format!("{MARK}{}", captured.len() - 1))
    }

    /// The bounds of a type variable in scope, or of a fresh variable.
    fn variable_upper(&self, kind: &Type) -> Type {
        match marker(kind) {
            Some(at) => {
                let upper = self.captured.borrow()[at].1.clone();
                self.upper(&upper)
            }
            None => bounded(self.context, self.node, kind, 0),
        }
    }

    /// `getUpperBound`, with what TypeCompatibility then sees of the type arguments: a wildcard stands for the bound of
    /// its parameter, `? extends B` for `B`.
    fn upper(&self, kind: &Type) -> Type {
        match kind {
            Type::Variable(_) => self.variable_upper(kind),
            Type::Bounded(false, bound) => self.upper(bound),
            Type::Bounded(true, _) | Type::Wildcard => Type::class(OBJECT),
            Type::Class(name, given) => Type::Class(name.clone(), given.iter().map(|argument| self.argument(argument)).collect()),
            Type::Array(element) => Type::Array(Box::new(self.argument(element))),
            other => other.clone(),
        }
    }

    fn argument(&self, kind: &Type) -> Type {
        match kind {
            Type::Bounded(false, bound) => self.upper(bound),
            Type::Bounded(true, _) | Type::Wildcard => Type::Wildcard,
            other => self.upper(other),
        }
    }

    /// The erased class of a type, its bound for a variable.
    fn class_of(&self, kind: &Type) -> Option<String> {
        match self.upper(kind) {
            Type::Class(name, _) => Some(name),
            _ => None,
        }
    }

    /// `Types.capture`: each wildcard argument becomes a fresh variable.
    fn capture(&self, kind: &Type) -> Type {
        let Type::Class(name, given) = kind else { return kind.clone() };
        let Some(info) = self.context.resolver.index.get(name) else { return kind.clone() };
        if info.type_parameters.len() != given.len() {
            return kind.clone();
        }
        let arguments = given
            .iter()
            .zip(&info.type_parameters)
            .map(|(argument, (_, declared))| match argument {
                Type::Wildcard => self.fresh(Type::Wildcard, declared.clone()),
                Type::Bounded(true, _) => self.fresh(argument.clone(), declared.clone()),
                Type::Bounded(false, bound) => {
                    let upper = match (self.class_of(bound), self.class_of(declared)) {
                        (Some(written), Some(own)) if own != OBJECT && !self.context.resolver.index.is_subtype(&written, &own) => {
                            let index = self.context.resolver.index;
                            let interface = |name: &str| index.get(name).is_some_and(|info| info.is_interface);
                            match () {
                                _ if index.is_subtype(&own, &written) => declared.clone(),
                                _ if interface(&written) && !interface(&own) => Type::class(&own),
                                _ if !interface(&written) => Type::class(&written),
                                _ => Type::class(&format!("{written}&{own}")),
                            }
                        }
                        _ => (**bound).clone(),
                    };
                    self.fresh(argument.clone(), upper)
                }
                other => other.clone(),
            })
            .collect();
        Type::Class(name.clone(), arguments)
    }

    /// `asSuper(capture(type), target)`'s type arguments; nothing for a raw type or a type that is not a subtype.
    fn as_super(&self, kind: &Type, target: &str, depth: u8) -> Option<Vec<Type>> {
        let index = self.context.resolver.index;
        let kind = match kind {
            Type::Variable(_) if marker(kind).is_none() && depth < 8 => bounded(self.context, self.node, kind, 0),
            Type::Variable(_) if depth < 8 => {
                let upper = self.captured.borrow()[marker(kind)?].1.clone();
                return self.as_super(&upper, target, depth + 1);
            }
            other => other.clone(),
        };
        let Type::Class(name, given) = &kind else { return None };
        let info = index.get(name);
        let generic = info.is_some_and(|info| !info.type_parameters.is_empty());
        if generic && info.is_some_and(|info| info.type_parameters.len() != given.len()) {
            return None;
        }
        if name == target {
            return Some(given.clone());
        }
        if depth > 24 {
            return None;
        }
        let map: std::collections::HashMap<String, Type> =
            info?.type_parameters.iter().map(|(parameter, _)| parameter.clone()).zip(given.iter().cloned()).collect();
        let info = info?;
        let supers = if info.bounded_supers.is_empty() { &info.generic_supers } else { &info.bounded_supers };
        supers.iter().find_map(|ancestor| self.as_super(&ancestor.substitute(&map), target, depth + 1))
    }

    /// `extractTypeArgAsMemberOfSupertype`.
    fn type_argument(&self, kind: &Type, target: &str, at: usize) -> Option<Type> {
        self.as_super(&self.capture(kind), target, 0)?.into_iter().nth(at)
    }

    /// A class with its own type parameters, each a fresh variable printed by its name and bounded by its bound.
    fn own_type(&self, class: &str) -> Type {
        let parameters = self.context.resolver.index.get(class).map(|info| info.type_parameters.clone()).unwrap_or_default();
        Type::Class(class.to_string(), parameters.into_iter().map(|(name, bound)| self.fresh(Type::Variable(name), bound)).collect())
    }

    fn used(&self) -> Option<Used> {
        let resolver = self.context.resolver;
        if self.node.kind() == "method_reference" {
            let (receiver, _) = self.printing.reference_owner(self.node)?;
            let taken = self.descriptor()?;
            let (_, _, method, _) = resolver.reference_method(self.node, &taken)?;
            return Some(Used { receiver, method: method.name.clone(), is_static: method.is_static, parameters: method.parameters.iter().map(Type::name).collect() });
        }
        let resolved = resolver.resolve_call(self.node)?;
        let receiver = match self.node.child_by_field_name("object") {
            Some(object) if object.kind() == "this" => self.own_type(&enclosing_type(self.context.file, resolver.scope, self.node)?),
            Some(object) if object.kind() == "super" => {
                let own = enclosing_type(self.context.file, resolver.scope, self.node)?;
                let info = resolver.index.get(&own)?;
                info.generic_supers.iter().find(|ancestor| Some(ancestor.name()) == info.superclass).cloned().unwrap_or_else(|| Type::class(OBJECT))
            }
            Some(object) => match self.printing.receiver(object)? {
                crate::java::types::expr::Receiver::Value(kind) => kind,
                crate::java::types::expr::Receiver::Static(owner) => Type::class(&owner),
            },
            None => self.own_type(&resolved.declaring),
        };
        Some(Used { receiver, method: resolved.method.name.clone(), is_static: resolved.method.is_static, parameters: resolved.method.parameters.iter().map(Type::name).collect() })
    }

    /// The parameter types of the function type a method reference stands for. When it is the argument of a generic
    /// method, the type parameters of that method that nothing else decides stand for their bounds, as javac infers them.
    fn descriptor(&self) -> Option<Vec<Type>> {
        let expected = self.printing.expected(self.node)?;
        let (parameters, _) = self.printing.function_type(&expected)?;
        let call = crate::engine::source::parent(self.node).filter(|list| list.kind() == "argument_list").and_then(crate::engine::source::parent);
        let Some(resolved) = call.filter(|call| call.kind() == "method_invocation").and_then(|call| self.context.resolver.resolve_call(call)) else {
            return Some(parameters);
        };
        let map: std::collections::HashMap<String, Type> = resolved.method.type_parameters.iter().cloned().zip(resolved.method.type_bounds.iter().cloned()).collect();
        Some(parameters.iter().map(|kind| kind.substitute(&map)).collect())
    }

    fn descends(&self, used: &Used, owner: &str) -> bool {
        self.class_of(&used.receiver).is_some_and(|class| self.context.resolver.index.is_subtype(&class, owner))
    }

    fn source_tree(&self, at: usize) -> Option<Node<'t>> {
        match self.node.kind() {
            "method_reference" => Some(self.node),
            _ => arguments(self.node).get(at).copied(),
        }
    }

    fn direct(&self, used: &Used) -> Option<(Node<'t>, Type, Type, Message)> {
        for (owner, type_argument, name, parameters) in DIRECT {
            if used.is_static || used.method != name || used.parameters != parameters || !self.descends(used, owner) {
                continue;
            }
            let tree = self.source_tree(0);
            let source = match self.node.kind() {
                "method_reference" => self.descriptor().and_then(|parameters| parameters.into_iter().next()),
                _ => tree.and_then(|tree| self.printing.type_of(tree)),
            };
            let target = self.type_argument(&used.receiver, owner, type_argument);
            if let (Some(tree), Some(source), Some(target)) = (tree, source, target) {
                return Some((tree, source, target, Message::Direct));
            }
        }
        None
    }

    fn type_arg(&self, used: &Used) -> Option<(Node<'t>, Type, Type, Message)> {
        if used.is_static || !TYPE_ARG.contains(&used.method.as_str()) || used.parameters != [COLLECTION] || !self.descends(used, COLLECTION) {
            return None;
        }
        let tree = self.source_tree(0)?;
        let argument = match self.node.kind() {
            "method_reference" => match self.printing.expected(self.node)? {
                Type::Class(_, given) => given.into_iter().next()?,
                _ => return None,
            },
            _ => self.printing.type_of(tree)?,
        };
        let source = self.type_argument(&argument, COLLECTION, 0)?;
        let target = self.type_argument(&used.receiver, COLLECTION, 0)?;
        let shown = self.printing.type_of(tree).unwrap_or(argument);
        Some((tree, source, target, Message::TypeArg(shown)))
    }

    fn binop(&self, used: &Used) -> Option<(Node<'t>, Type, Type, Message)> {
        for (collection, class, name) in STATIC {
            if !used.is_static || used.method != name || self.class_of(&used.receiver).as_deref() != Some(class) {
                continue;
            }
            let (first, second) = match self.node.kind() {
                "method_reference" => {
                    let parameters = self.descriptor()?;
                    (parameters.first().cloned(), parameters.get(1).cloned())
                }
                _ => {
                    let list = arguments(self.node);
                    (list.first().and_then(|tree| self.printing.type_of(*tree)), list.get(1).and_then(|tree| self.printing.type_of(*tree)))
                }
            };
            let tree = self.source_tree(0);
            let source = first.and_then(|kind| self.type_argument(&kind, collection, 0));
            let target = second.and_then(|kind| self.type_argument(&kind, collection, 0));
            if let (Some(tree), Some(source), Some(target)) = (tree, source, target) {
                return Some((tree, source, target, Message::Binop));
            }
        }
        None
    }

    /// `Signatures.prettyType`: simple names, a fresh variable as its wildcard.
    fn pretty(&self, kind: &Type) -> String {
        if let Some(at) = marker(kind) {
            let shown = self.captured.borrow()[at].0.clone();
            return self.pretty(&shown);
        }
        match kind {
            Type::Class(name, given) => {
                let simple = name.rsplit('.').next().unwrap_or(name);
                if given.is_empty() { simple.to_string() } else { format!("{simple}<{}>", given.iter().map(|part| self.pretty(part)).collect::<Vec<_>>().join(", ")) }
            }
            Type::Array(element) => format!("{}[]", self.pretty(element)),
            Type::Wildcard => "?".to_string(),
            Type::Bounded(lower, bound) => format!("? {} {}", if *lower { "super" } else { "extends" }, self.pretty(bound)),
            other => other.name(),
        }
    }

    fn shown(&self, kind: &Type) -> String {
        if let Some(at) = marker(kind) {
            let shown = self.captured.borrow()[at].0.clone();
            return self.shown(&shown);
        }
        match kind {
            Type::Bounded(lower, bound) => format!("? {} {}", if *lower { "super" } else { "extends" }, self.shown(bound)),
            Type::Class(name, given) if !given.is_empty() => format!("{name}<{}>", given.iter().map(|part| self.shown(part)).collect::<Vec<_>>().join(",")),
            other => qualified(other),
        }
    }

    /// Whether every class in the type is on the class path; javac would not get this far otherwise.
    fn known(&self, kind: &Type) -> bool {
        match kind {
            Type::Class(name, arguments) => {
                name.split('&').all(|part| self.context.resolver.index.get(part).is_some()) && arguments.iter().all(|argument| self.known(argument))
            }
            Type::Array(element) | Type::Bounded(_, element) => self.known(element),
            _ => true,
        }
    }

    fn run(&self) {
        let Some(used) = self.used() else { return };
        if !FIRST_ORDER.iter().any(|owner| self.descends(&used, owner)) {
            return;
        }
        let Some((tree, source, target, kind)) = self.direct(&used).or_else(|| self.type_arg(&used)).or_else(|| self.binop(&used)) else { return };
        let (upper_target, upper_source) = (self.upper(&target), self.upper(&source));
        if !self.known(&upper_target) || !self.known(&upper_source) {
            return;
        }
        let Some(report) = compatibility(self.context, &upper_target, &upper_source, &[], &[]) else { return };
        let (mut source_name, mut target_name) = (self.pretty(&source), self.pretty(&target));
        if source_name == target_name {
            source_name = self.shown(&source);
            target_name = self.shown(&target);
        }
        let argument = printed(self.context.file, tree);
        let message = match kind {
            Message::Direct => format!(
                "Argument '{argument}' should not be passed to this method; its type {source_name} is not compatible with its collection's type argument {target_name}"
            ),
            Message::TypeArg(whole) => format!(
                "Argument '{argument}' should not be passed to this method; its type {} has a type argument {source_name} that is not compatible with its collection's type argument {target_name}",
                self.pretty(&whole)
            ),
            Message::Binop => format!("Argument '{argument}' should not be passed to this method; its type {source_name} is not compatible with {target_name}"),
        };
        let message = format!("{message}{}", report.extra);
        self.context.report_fixed(NAME, self.node, preferred(self.node), &message, &[]);
    }
}

pub fn collection_incompatible_type(context: &Context, node: Node) {
    let name = match node.kind() {
        "method_invocation" => node.child_by_field_name("name").map(|name| context.text(name)),
        "method_reference" => crate::engine::source::children(node).last().map(|name| context.text(*name)),
        _ => None,
    };
    if !name.is_some_and(|name| NAMES.contains(&name)) {
        return;
    }
    if node.kind() == "method_invocation" {
        let Some(resolved) = context.resolver.resolve_call(node) else { return };
        let parameters: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
        let method = resolved.method.name.as_str();
        let listed = match resolved.method.is_static {
            true => STATIC.iter().any(|(_, _, name)| *name == method),
            false => DIRECT.iter().any(|(_, _, name, listed)| *name == method && parameters == *listed) || (TYPE_ARG.contains(&method) && parameters == [COLLECTION]),
        };
        if !listed {
            return;
        }
    }
    let check = Check { context, printing: context.resolver.printing(), node, captured: Default::default() };
    check.run();
}
