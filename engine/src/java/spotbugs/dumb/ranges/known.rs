//! The values DumbMethods knows when it checks an index, measured on test code:
//! - a whole number: a constant, a local whose stores all give the same number, `x.length` of an array of known
//!   length, a cast of a known number;
//! - an array length: `new T[n]` with one size given, an initializer's element count, a local whose stores all
//!   give the same length, `c ? x : y` of equal lengths;
//! - a string: a constant, a local whose stores all give the same string, `trim()`, `intern()` and `toString()` of
//!   a known string, `new StringBuilder(s).toString()`;
//! - a field of a class of this file whose stores all agree: its initializer, its default value unless it is
//!   `final` or every constructor (a static initializer for a static field) sets it, and every store into it.
//!   SpotBugs reads the stores of the whole run; only `private` and `final` fields are judged here, as no other
//!   file can change them.
use super::super::super::Context;
use super::fields::{always_set, lombok_sets};
use super::super::super::fields::field_key;
use super::super::numbers::values::{folded, local, operator, reaching, writes};
use super::super::super::observed::{BODIES, always_before};
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::constant::Constant;
use crate::java::types::expr::unwrap;
use std::cell::RefCell;
use std::rc::Rc;
use std::collections::HashMap;
use tree_sitter::Node;

const DEPTH: usize = 6;
const OWNERS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "static_initializer", "class_body"];

type Key = (String, String);

/// What a field is given: a value, its default value, or something SpotBugs cannot follow.
#[derive(Clone, Copy)]
enum Given<'t> {
    Value(Node<'t>),
    Default,
    Unknown,
}

pub struct Known<'c, 'a> {
    context: &'c Context<'a>,
    locals: RefCell<HashMap<(usize, String), Rc<(Vec<Node<'a>>, Vec<usize>)>>>,
}

impl<'c, 'a> Known<'c, 'a> {
    pub fn new(context: &'c Context<'a>) -> Self {
        Known { context, locals: RefCell::new(HashMap::new()) }
    }

    fn stores(&self) -> &HashMap<Key, Vec<Option<Node<'a>>>> {
        self.context.field_stores.get_or_init(|| {
            let context = self.context;
            let mut found: HashMap<Key, Vec<Option<Node<'a>>>> = HashMap::new();
            walk(context.file.tree.root_node(), |node| {
                let (target, given) = match node.kind() {
                    "assignment_expression" => {
                        let given = if operator(context, node) == "=" { node.child_by_field_name("right") } else { None };
                        (node.child_by_field_name("left"), given)
                    }
                    "update_expression" => (named_children(node).into_iter().find(|part| matches!(part.kind(), "identifier" | "field_access")), None),
                    _ => return,
                };
                if let Some(key) = target.and_then(|target| field_key(context, unwrap(target))) {
                    found.entry(key).or_default().push(given);
                }
            });
            found
        })
    }

    /// Everything a `private` or `final` field of a class of this file is given.
    fn given(&self, node: Node) -> Option<Vec<Given<'a>>> {
        let key = field_key(self.context, node)?;
        let class = *self.context.classes.get(&key.0)?;
        let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))?;
        let member = children(body).into_iter().find(|member| {
            let named = |part: &Node| part.child_by_field_name("name").is_some_and(|name| self.context.text(name) == key.1);
            matches!(member.kind(), "field_declaration" | "constant_declaration") && declarators(*member).iter().any(named)
        })?;
        let fixed = member.kind() == "constant_declaration" || has_modifier(member, "final");
        if !fixed && (!has_modifier(member, "private") || lombok_sets(self.context, class, member)) {
            return None;
        }
        let declarator = declarators(member).into_iter().find(|part| part.child_by_field_name("name").is_some_and(|name| self.context.text(name) == key.1))?;
        let statics = has_modifier(member, "static");
        let mut given = match declarator.child_by_field_name("value") {
            Some(value) => vec![Given::Value(value)],
            None if fixed || always_set(self.context, body, &key.1, statics) => Vec::new(),
            None => vec![Given::Default],
        };
        given.extend(self.stores().get(&key).into_iter().flatten().map(|given| given.map_or(Given::Unknown, Given::Value)));
        (!given.is_empty()).then_some(given)
    }

    /// One answer when every value agrees, worked out by `of`.
    fn agreed<T: PartialEq>(&self, values: Vec<Given<'a>>, of: &dyn Fn(Node<'a>) -> Option<T>) -> Option<T> {
        let mut answers = values.into_iter().map(|given| match given {
            Given::Value(value) => of(value),
            Given::Default | Given::Unknown => None,
        });
        let first = answers.next()??;
        answers.all(|answer| answer.as_ref() == Some(&first)).then_some(first)
    }

    /// The values a local holds at a use, each store as its stored value.
    fn held(&self, node: Node<'a>) -> Option<Vec<Given<'a>>> {
        if !local(self.context, node) {
            return None;
        }
        let body = ancestor(node, BODIES)?;
        let locals = self.locals(body, self.context.text(node));
        let (writes, declared) = locals.as_ref();
        let found = reaching(node, writes, body);
        let covered = found.first().is_some_and(|store| store.end_byte() <= node.start_byte() && always_before(*store, node, body) && same_arm(*store, node));
        let declared = declared.iter().any(|end| *end <= node.start_byte());
        let incoming = (!covered && !declared).then_some(Given::Unknown);
        let held: Vec<Given> = found
            .into_iter()
            .map(|store| match store.kind() {
                "variable_declarator" => store.child_by_field_name("value").map_or(Given::Unknown, Given::Value),
                "assignment_expression" if operator(self.context, store) == "=" => store.child_by_field_name("right").map_or(Given::Unknown, Given::Value),
                _ => Given::Unknown,
            })
            .chain(incoming)
            .collect();
        (!held.is_empty()).then_some(held)
    }

    /// The writes of a name in a body, not those of a variable of the same name in a class or lambda inside it,
    /// and where the body declares it; worked out once per body and name.
    fn locals(&self, body: Node<'a>, name: &str) -> Rc<(Vec<Node<'a>>, Vec<usize>)> {
        let key = (body.id(), name.to_string());
        if let Some(found) = self.locals.borrow().get(&key) {
            return found.clone();
        }
        let own = |part: Node| ancestor(part, OWNERS).is_some_and(|around| around.id() == body.id());
        let found: Vec<Node> = writes(self.context, body, name).into_iter().filter(|part| own(*part)).collect();
        let mut declared = Vec::new();
        walk(body, |part| {
            if part.kind() == "variable_declarator" && part.child_by_field_name("name").is_some_and(|named| self.context.text(named) == name) && own(part) {
                declared.push(part.end_byte());
            }
        });
        let found = Rc::new((found, declared));
        self.locals.borrow_mut().insert(key, found.clone());
        found
    }

    fn followed<T: PartialEq>(&self, node: Node<'a>, depth: usize, default: Option<T>, of: &dyn Fn(Node<'a>, usize) -> Option<T>) -> Option<T> {
        if depth > DEPTH {
            return None;
        }
        let next = |value: Node<'a>| of(value, depth + 1);
        match node.kind() {
            "identifier" if local(self.context, node) => self.agreed(self.held(node)?, &next),
            "identifier" | "field_access" => {
                let given = self.given(node)?;
                if given.iter().any(|given| matches!(given, Given::Default)) {
                    let rest: Vec<Given> = given.into_iter().filter(|given| !matches!(given, Given::Default)).collect();
                    let value = default?;
                    return rest.into_iter().all(|given| matches!(given, Given::Value(found) if of(found, depth + 1).as_ref() == Some(&value))).then_some(value);
                }
                self.agreed(given, &next)
            }
            "ternary_expression" => {
                let (Some(yes), Some(no)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) else { return None };
                let yes = of(yes, depth + 1)?;
                (of(no, depth + 1).as_ref() == Some(&yes)).then_some(yes)
            }
            _ => None,
        }
    }

    /// The whole number an `int` expression is known to hold.
    pub fn number(&self, node: Node<'a>) -> Option<i32> {
        self.number_at(node, 0)
    }

    fn number_at(&self, node: Node<'a>, depth: usize) -> Option<i32> {
        let node = unwrap(node);
        let folds = if local(self.context, node) { None } else { folded(self.context, node) };
        match folds {
            Some(Constant::Int(value)) => return Some(value),
            Some(Constant::Char(value)) => return Some(i32::from(value)),
            Some(Constant::Long(value)) => return Some(value as i32),
            Some(_) => return None,
            None => {}
        }
        match node.kind() {
            "cast_expression" => {
                let value = self.number_at(node.child_by_field_name("value")?, depth + 1)?;
                match node.child_by_field_name("type").map(|kind| self.context.text(kind)) {
                    Some("int") => Some(value),
                    Some("short") => Some(i32::from(value as i16)),
                    Some("char") => Some(i32::from(value as u16)),
                    Some("byte") => Some(i32::from(value as i8)),
                    _ => None,
                }
            }
            "field_access" if node.child_by_field_name("field").is_some_and(|field| self.context.text(field) == "length") => {
                let object = node.child_by_field_name("object")?;
                self.context.resolver.type_of(object).filter(|kind| matches!(kind, crate::java::types::model::Type::Array(_)))?;
                self.length_at(object, depth + 1)
            }
            _ => self.followed(node, depth, Some(0), &|value, depth| self.number_at(value, depth)),
        }
    }

    /// The length an array expression is known to have.
    pub fn length(&self, node: Node<'a>) -> Option<i32> {
        self.length_at(node, 0)
    }

    fn length_at(&self, node: Node<'a>, depth: usize) -> Option<i32> {
        let node = unwrap(node);
        match node.kind() {
            "array_initializer" => Some(named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).count() as i32),
            "array_creation_expression" => {
                if let Some(values) = node.child_by_field_name("value") {
                    return self.length_at(values, depth + 1);
                }
                let sizes: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
                let [size] = sizes[..] else { return None };
                self.number_at(size.named_child(0)?, depth + 1)
            }
            "cast_expression" => self.length_at(node.child_by_field_name("value")?, depth + 1),
            _ => self.followed(node, depth, None, &|value, depth| self.length_at(value, depth)),
        }
    }

    /// The string an expression is known to hold.
    pub fn text(&self, node: Node<'a>) -> Option<String> {
        self.text_at(node, 0)
    }

    fn text_at(&self, node: Node<'a>, depth: usize) -> Option<String> {
        let node = unwrap(node);
        if let Some(text) = self.context.resolver.constant_string(node) {
            return Some(text);
        }
        if depth > DEPTH {
            return None;
        }
        match node.kind() {
            "method_invocation" => {
                let name = self.context.text(node.child_by_field_name("name")?);
                let object = unwrap(node.child_by_field_name("object")?);
                let listed = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                if !listed.is_empty() {
                    return None;
                }
                if name == "toString" && object.kind() == "object_creation_expression" {
                    let built = self.context.resolver.resolve_constructor(object)?;
                    let arguments = object.child_by_field_name("arguments").map(named_children)?;
                    let [argument] = arguments[..] else { return None };
                    return (built.declaring == "java.lang.StringBuilder").then(|| self.text_at(argument, depth + 1)).flatten();
                }
                let call = self.context.resolver.resolve_call(node)?;
                if call.declaring != "java.lang.String" {
                    return None;
                }
                let text = self.text_at(object, depth + 1)?;
                match name {
                    "trim" => Some(text.trim_matches(|letter: char| letter <= ' ').to_string()),
                    "intern" | "toString" => Some(text),
                    _ => None,
                }
            }
            "cast_expression" => self.text_at(node.child_by_field_name("value")?, depth + 1),
            _ => self.followed(node, depth, None, &|value, depth| self.text_at(value, depth)),
        }
    }
}

/// Whether no `if` or `?:` around both puts the store and the use on different arms.
fn same_arm(store: Node, usage: Node) -> bool {
    let inside = |part: Option<Node>, node: Node| part.is_some_and(|part| part.start_byte() <= node.start_byte() && node.end_byte() <= part.end_byte());
    let mut at = parent(store);
    while let Some(node) = at {
        if matches!(node.kind(), "if_statement" | "ternary_expression") {
            let arms = [node.child_by_field_name("consequence"), node.child_by_field_name("alternative")];
            if arms.iter().any(|arm| inside(*arm, store) && !inside(*arm, usage)) && arms.iter().any(|arm| inside(*arm, usage)) {
                return false;
            }
        }
        at = parent(node);
    }
    true
}

/// The length of a string as Java counts it, in UTF-16 units.
pub fn units(text: &str) -> i32 {
    text.encode_utf16().count() as i32
}
