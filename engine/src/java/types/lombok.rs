//! What Lombok adds to source classes when javac runs it: the getters and setters it writes, and the types of `val` and
//! `var` locals. Used only for runs over code compiled with Lombok (`Options::lombok`).
use super::model::{ClassInfo, Detail, Field, Method, Type, flag};
use super::scope::Resolver;
use crate::engine::source::children;
use crate::java::fields::Fields;
use crate::java::helpers::{declarators, has_modifier, modifiers};
use tree_sitter::Node;

/// What a class or field asks Lombok to write: an accessor's access bits, `None` inside for `AccessLevel.NONE`.
#[derive(Default, Clone)]
struct Asked {
    getter: Option<Option<u16>>,
    setter: Option<Option<u16>>,
    data: bool,
    value: bool,
    naming: Option<Naming>,
}

/// How `@Accessors` names the accessors: without `get`, `is` and `set`, after taking off one of the prefixes.
#[derive(Default, Clone)]
struct Naming {
    fluent: bool,
    chain: bool,
    prefixes: Vec<String>,
}

fn accessor(name: &str, parameters: Vec<Type>, returns: Type, generic: Type, access: u16) -> Method {
    let is_static = access & 8 != 0;
    let flags = match access & 7 {
        1 => flag::PUBLIC,
        2 => flag::PRIVATE,
        4 => flag::PROTECTED,
        _ => 0,
    };
    Method {
        name: name.to_string(),
        generic_parameters: parameters.clone(),
        parameters,
        returns,
        generic_returns: generic,
        type_parameters: Vec::new(),
        type_bounds: Vec::new(),
        package_private: access & 7 == 0,
        is_abstract: false,
        is_static,
        is_private: access & 2 != 0,
        varargs: false,
        shown: String::new(),
        nullable_parameters: 0,
        flags: flags | if is_static { flag::STATIC } else { 0 },
        throws: Vec::new(),
        names: Vec::new(),
        detail: Detail { access, ..Detail::default() },
        contract: String::new(),
        starts: false,
    }
}

fn capitalized(name: &str) -> String {
    let mut letters = name.chars();
    letters.next().map(|first| first.to_uppercase().chain(letters).collect()).unwrap_or_default()
}

fn decapitalized(name: &str) -> String {
    let mut letters = name.chars();
    letters.next().map(|first| first.to_lowercase().chain(letters).collect()).unwrap_or_default()
}

/// The access bits an `AccessLevel` argument asks for, `None` for `NONE`.
fn level(arguments: &str) -> Option<u16> {
    let named = |level: &str| {
        arguments.split(|c: char| !c.is_alphanumeric() && c != '_').any(|word| word == level)
    };
    match () {
        _ if named("NONE") => None,
        _ if named("PRIVATE") => Some(2),
        _ if named("PROTECTED") => Some(4),
        _ if named("PACKAGE") || named("MODULE") => Some(0),
        _ => Some(1),
    }
}

/// The values of `key = ...` in annotation arguments: one string or a braced list of strings.
fn strings(arguments: &str, key: &str) -> Vec<String> {
    let Some(at) = arguments.find(key) else { return Vec::new() };
    let rest = arguments[at + key.len()..].trim_start();
    let Some(rest) = rest.strip_prefix('=') else { return Vec::new() };
    let rest = rest.trim_start();
    let end = if rest.starts_with('{') { rest.find('}') } else { rest.find(|c| c == ',' || c == ')') };
    let value = &rest[..end.unwrap_or(rest.len())];
    value.split('"').skip(1).step_by(2).map(str::to_string).collect()
}

fn naming(arguments: &str) -> Naming {
    let set = |key: &str| {
        arguments.find(key).is_some_and(|at| arguments[at + key.len()..].trim_start().trim_start_matches('=').trim_start().starts_with("true"))
    };
    let fluent = set("fluent");
    Naming { fluent, chain: fluent || set("chain"), prefixes: strings(arguments, "prefix") }
}

/// The property of a field after a prefix comes off, or `None` when prefixes are listed and none fits.
fn unprefixed<'a>(field: &'a str, prefixes: &[String]) -> Option<&'a str> {
    if prefixes.is_empty() {
        return Some(field);
    }
    prefixes.iter().find_map(|prefix| {
        let rest = field.strip_prefix(prefix.as_str())?;
        let letter = prefix.chars().last().is_some_and(char::is_alphabetic);
        let fits = !rest.is_empty() && (!letter || rest.chars().next().is_some_and(|c| !c.is_lowercase()));
        fits.then_some(rest)
    })
}

/// The names Lombok gives the getter and setter of a field: a `boolean` field `isOpen` has `isOpen` and `setOpen`.
fn names(field: &str, boolean: bool, naming: &Naming) -> Option<(String, String)> {
    let base = unprefixed(field, &naming.prefixes)?;
    if naming.fluent {
        let name = decapitalized(base);
        return Some((name.clone(), name));
    }
    let rest = base.strip_prefix("is").filter(|rest| boolean && rest.chars().next().is_some_and(char::is_uppercase));
    let property = rest.map_or_else(|| capitalized(base), str::to_string);
    Some((format!("{}{property}", if boolean { "is" } else { "get" }), format!("set{property}")))
}

impl Resolver<'_> {
    fn lombok_name(&self, written: &str, name: &str) -> bool {
        let full = [format!("lombok.{name}"), format!("lombok.experimental.{name}")];
        if full.iter().any(|path| path == written) {
            return true;
        }
        written == name
            && match self.scope.single.get(name) {
                Some(imported) => full.contains(imported),
                None => self.scope.on_demand.iter().any(|package| package == "lombok" || package == "lombok.experimental"),
            }
    }

    /// Whether a local declared with the type `written` takes the type of its value, as `var` and Lombok's `val` do.
    pub fn inferred_local(&self, written: &str) -> bool {
        written == "var" || (self.index.lombok && ["val", "var"].iter().any(|name| self.lombok_name(written, name)))
    }

    fn asked(&self, declaration: Node) -> Asked {
        let mut asked = Asked::default();
        let annotations = modifiers(declaration).map(children).unwrap_or_default();
        for annotation in annotations.into_iter().filter(|child| matches!(child.kind(), "marker_annotation" | "annotation")) {
            let Some(name) = annotation.field("name").map(|name| self.file.text_of(name)) else { continue };
            let arguments = annotation.field("arguments").map(|arguments| self.file.text_of(arguments)).unwrap_or_default();
            match () {
                _ if self.lombok_name(name, "Getter") => asked.getter = Some(level(arguments)),
                _ if self.lombok_name(name, "Setter") => asked.setter = Some(level(arguments)),
                _ if self.lombok_name(name, "Data") => asked.data = true,
                _ if self.lombok_name(name, "Value") => asked.value = true,
                _ if self.lombok_name(name, "Accessors") => asked.naming = Some(naming(arguments)),
                _ => {}
            }
        }
        asked
    }

    /// Adds the `log` field PMD gives every class annotated with `@lombok.extern.slf4j.Slf4j`, Lombok on the class path
    /// or not.
    pub fn slf4j_field(&self, declaration: Node, info: &mut ClassInfo) {
        if !self.annotation_names(declaration).iter().any(|name| name == "lombok.extern.slf4j.Slf4j") {
            return;
        }
        let logger = Type::class("org.slf4j.Logger");
        info.fields.push(Field {
            name: "log".to_string(),
            kind: logger.clone(),
            generic: logger,
            constant: None,
            number: None,
            fixed: None,
            strict: false,
            is_private: true,
            flags: flag::STATIC | flag::FINAL,
        });
    }

    /// Adds the getters and setters Lombok writes for `declaration` to `info`, which already holds its own members.
    pub fn lombok_members(&self, declaration: Node, info: &mut ClassInfo) {
        if !self.index.lombok || !matches!(declaration.kind(), "class_declaration" | "enum_declaration") {
            return;
        }
        let class = self.asked(declaration);
        let Some(body) = declaration.field("body") else { return };
        let mut members = children(body);
        members.extend(members.clone().into_iter().filter(|child| child.kind() == "enum_body_declarations").flat_map(children));
        let public = Some(Some(1)).filter(|_| class.data || class.value);
        let chained = Type::class(&info.name);
        for member in members.into_iter().filter(|member| member.kind() == "field_declaration") {
            let own = self.asked(member);
            let is_static = has_modifier(member, "static");
            let fixed = has_modifier(member, "final") || class.value;
            let inherited = |asked: Option<Option<u16>>| if is_static { None } else { asked.or(public) };
            let getter = own.getter.or(inherited(class.getter)).flatten();
            let setter = if fixed { None } else { own.setter.or(inherited(class.setter.or(public.filter(|_| class.data)))).flatten() };
            let naming = own.naming.or(class.naming.clone()).unwrap_or_default();
            let statics = if is_static { 8 } else { 0 };
            for declarator in declarators(member) {
                let Some(name) = declarator.field("name").map(|name| self.file.text_of(name)) else { continue };
                let Some(field) = info.fields.iter().find(|field| field.name == name).cloned() else { continue };
                let boolean = field.kind == Type::Primitive("boolean");
                let Some((read, write)) = names(name, boolean, &naming) else { continue };
                let written = |method: &str, count: usize| {
                    info.methods.iter().any(|known| {
                        known.name.eq_ignore_ascii_case(method) && (known.parameters.len() == count || known.varargs)
                    })
                };
                let other = boolean.then(|| format!("get{}", &read[2..])).filter(|_| !naming.fluent && read.starts_with("is"));
                let add_getter = getter.filter(|_| !written(&read, 0) && !other.as_ref().is_some_and(|other| written(other, 0)));
                let add_setter = setter.filter(|_| !written(&write, 1));
                if let Some(access) = add_getter {
                    info.methods.push(accessor(&read, Vec::new(), field.kind.clone(), field.generic.clone(), access | statics));
                }
                if let Some(access) = add_setter {
                    let returns = if naming.chain && !is_static { chained.clone() } else { Type::Primitive("void") };
                    let mut method = accessor(&write, vec![field.kind.clone()], returns.clone(), returns, access | statics);
                    method.generic_parameters = vec![field.generic.clone()];
                    method.names = vec![name.to_string()];
                    info.methods.push(method);
                }
            }
        }
    }
}
