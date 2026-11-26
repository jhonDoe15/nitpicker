//! InvalidLink: `{@link}` tags that name nothing, `{@link http://...}`, and links to parameters.
use super::doc::{Kind, Tree};
use super::fixes::Fix;
use super::javadoc::{Documented, Element};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

const CHECK: &str = "InvalidLink";
const PRIMITIVES: [&str; 8] = ["boolean", "byte", "char", "double", "float", "int", "long", "short"];

struct Links<'d, 'a, 'c, 't> {
    documented: &'d Documented<'a, 'c, 't>,
    scope: Node<'t>,
    class: Option<String>,
    parameters: Vec<String>,
}

fn scope_of<'t>(documented: &Documented<'_, '_, 't>, declaration: Node<'t>) -> Node<'t> {
    if documented.element != Element::Class {
        return declaration;
    }
    let body = declaration.child_by_field_name("body");
    body.and_then(|body| named_children(body).into_iter().find(|part| !part.kind().ends_with("comment"))).or(body).unwrap_or(declaration)
}

/// The type of a parameter as written, without type arguments and without the parameter's own name.
fn erase(text: &str) -> String {
    let (mut depth, mut out) = (0i32, String::new());
    for character in text.chars() {
        match character {
            '<' => depth += 1,
            '>' => depth -= 1,
            other if depth == 0 => out.push(other),
            _ => {}
        }
    }
    let words: Vec<&str> = out.split_whitespace().collect();
    match words.as_slice() {
        [.., kind, name] if !kind.ends_with('.') && !name.starts_with('[') && !name.starts_with('.') && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$') => (*kind).to_string(),
        _ => words.concat(),
    }
}

fn split_arguments(text: &str) -> Vec<&str> {
    let (mut depth, mut from, mut out) = (0i32, 0, Vec::new());
    for (at, character) in text.char_indices() {
        match character {
            '<' => depth += 1,
            '>' => depth -= 1,
            ',' if depth == 0 => {
                out.push(text[from..at].trim());
                from = at + 1;
            }
            _ => {}
        }
    }
    out.push(text[from..].trim());
    out
}

impl Links<'_, '_, '_, '_> {
    fn class_named(&self, text: &str) -> Option<String> {
        let context = self.documented.context;
        let text: String = text.split_whitespace().collect();
        context.resolver.class_name(self.scope, &text).filter(|found| context.resolver.index.has(found))
    }

    fn type_named(&self, text: &str) -> Option<Type> {
        let erased = erase(text);
        let mut base = erased.trim();
        let mut dimensions = 0;
        loop {
            if let Some(rest) = base.strip_suffix("...") {
                base = rest.trim_end();
                dimensions += 1;
            } else if let Some(rest) = base.strip_suffix("[]") {
                base = rest.trim_end();
                dimensions += 1;
            } else {
                break;
            }
        }
        let mut found = if let Some(primitive) = PRIMITIVES.iter().find(|name| **name == base) {
            Type::Primitive(primitive)
        } else if type_parameter(self.documented.context.file, self.scope, base).is_some() {
            Type::class(crate::java::types::model::OBJECT)
        } else {
            Type::class(&self.class_named(base)?)
        };
        for _ in 0..dimensions {
            found = Type::Array(Box::new(found));
        }
        Some(found)
    }

    fn accepts(&self, wanted: &Type, declared: &Type) -> bool {
        wanted == &declared.erased()
    }

    fn member_exists(&self, class: &str, member: &str) -> bool {
        let index = self.documented.context.resolver.index;
        let (name, arguments) = match member.split_once('(') {
            Some((name, rest)) => {
                let Some(inside) = rest.trim_end().strip_suffix(')') else { return false };
                (name.trim(), Some(inside))
            }
            None => (member.trim(), None),
        };
        let mut lineage: Vec<String> = index.lineage(class).iter().cloned().collect();
        if index.get(class).is_some_and(|info| info.is_interface) {
            lineage.retain(|owner| owner != crate::java::types::model::OBJECT);
        } else if !lineage.iter().any(|owner| owner == crate::java::types::model::OBJECT) {
            lineage.push(crate::java::types::model::OBJECT.to_string());
        }
        let simple = class.rsplit('.').next().unwrap_or(class);
        let wanted: Option<Vec<Option<Type>>> = match arguments {
            None => None,
            Some(text) if text.trim().is_empty() => Some(Vec::new()),
            Some(text) => {
                let mut types = Vec::new();
                for part in split_arguments(text) {
                    types.push(self.type_named(part));
                }
                Some(types)
            }
        };
        let named = if name == simple { "<init>" } else { name };
        for owner in &lineage {
            let Some(info) = index.get(owner) else { continue };
            if wanted.is_none() && (info.fields.iter().any(|field| field.name == name) || info.enum_constants.is_some() && matches!(name, "values" | "valueOf")) {
                return true;
            }
            if info.flags & crate::java::types::model::flag::RECORD != 0 && wanted.as_ref().is_none_or(|types| types.is_empty()) && info.fields.iter().any(|field| field.name == name) {
                return true;
            }
            for method in info.methods.iter().filter(|method| method.name == named) {
                match &wanted {
                    None => return true,
                    Some(types) => {
                        let fits = |at: usize, given: &Option<Type>| match given {
                            None => true,
                            Some(given) => {
                                let variable = matches!(method.generic_parameters.get(at), Some(Type::Variable(_)));
                                self.accepts(given, &method.parameters[at]) || variable && given == &Type::class(crate::java::types::model::OBJECT)
                            }
                        };
                        if method.parameters.len() == types.len() && types.iter().enumerate().all(|(at, given)| fits(at, given)) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    /// Whether javac finds an element for the reference; a class part that does not exist gives none.
    fn element(&self, reference: &str) -> bool {
        if let Some((class, _)) = reference.split_once("##") {
            return class.trim().is_empty() || self.class_exists(class);
        }
        let Some((class, member)) = reference.split_once('#') else {
            let trimmed = reference.trim();
            return self.class_exists(trimmed) || self.in_scope(trimmed);
        };
        if !class.trim().is_empty() {
            return self.class_named(class).is_some_and(|owner| self.member_exists(&owner, member));
        }
        self.in_scope(member)
    }

    /// A member of the class around the comment, or of a class around that one.
    fn in_scope(&self, member: &str) -> bool {
        let mut owner = self.class.clone();
        while let Some(name) = owner {
            if self.member_exists(&name, member) {
                return true;
            }
            owner = name.rsplit_once('.').map(|(outer, _)| outer.to_string()).filter(|outer| self.documented.context.resolver.index.has(outer));
        }
        false
    }

    fn class_exists(&self, class: &str) -> bool {
        self.class_named(class).is_some() || self.type_named(class).is_some()
    }

    fn link(&self, tree: &Tree) {
        let Some(reference) = tree.children.first().filter(|child| child.kind == Kind::Reference) else { return };
        let documented = self.documented;
        let reference_text: String = documented.comment.text[reference.pos..reference.end].iter().collect();
        let signature = reference_text.as_str();
        if signature.is_empty() || self.element(signature) || (signature.contains('.') && !signature.contains('#')) {
            return;
        }
        if let Some((class, _)) = signature.split_once('#') {
            if class.is_empty() || self.class_exists(class) {
                let note = if signature.contains('<') { " Note, in particular, that the _erasure_ of generic types should be used (for example, List rather than List<Foo>)." } else { "" };
                let message = format!(
                    "The reference `{signature}` to a method doesn't resolve to anything. Is it misspelt, or is the parameter list not correct? See https://docs.oracle.com/javase/8/docs/technotes/tools/unix/javadoc.html#JSSOR654 for documentation on how to form method links.{note}"
                );
                return documented.report_fixed(CHECK, tree.pos, &message, &[]);
            }
        }
        if self.parameters.iter().any(|parameter| parameter == signature) {
            let message = format!("`{signature}` is a parameter; use {{@code paramName}} to refer to parameters inline.");
            let fix = match (documented.comment.source_pos(tree.pos), documented.comment.source_pos(tree.end)) {
                (Some(start), Some(end)) => Fix::replace(start, end, format!("{{@code {signature}}}")),
                _ => Fix::new(),
            };
            return documented.report_fixed(CHECK, tree.pos, &message, &[fix]);
        }
        if signature.chars().next().is_some_and(char::is_lowercase) && !signature.contains('#') {
            let message = format!("`{signature}` is not known here. Should it be a reference to a method?");
            let fix = documented.comment.source_pos(reference.pos).map_or_else(Fix::new, |at| Fix::replace(at, at, "#"));
            documented.report_fixed(CHECK, tree.pos, &message, &[fix]);
        }
    }

    fn http(&self, at: usize, tree: &Tree, next: Option<&Tree>) {
        let documented = self.documented;
        let body: String = documented.comment.text[tree.pos..tree.end.min(documented.comment.text.len())].iter().collect();
        if !body.starts_with("{@link ") {
            return;
        }
        let Some(next) = next.filter(|next| next.kind == Kind::Text) else { return };
        let text: String = documented.comment.text[next.pos..next.end].iter().collect();
        let Some(target) = text.strip_suffix('}').filter(|target| !target.contains('}')) else { return };
        let reference = &body["{@link ".len()..];
        let label = if target.is_empty() { "link" } else { target };
        let close = next.pos + text.chars().position(|character| character == '}').unwrap_or(0) + 1;
        let _ = at;
        let (Some(start), Some(end)) = (documented.comment.source_pos(tree.pos), documented.comment.source_pos(close)) else { return };
        let fix = Fix::replace(start, end, format!("<a href=\"{reference}\">{label}</a>"));
        documented.report_fixed(CHECK, tree.pos, "{@link} cannot be used for HTTP links. Use an <a> tag instead.", &[fix]);
    }
}

fn parameter_list(documented: &Documented, declaration: Node) -> Vec<String> {
    if documented.element == Element::Method { super::javadoc::parameter_names(documented.context, declaration).into_iter().map(String::from).collect() } else { Vec::new() }
}

pub(super) fn invalid_link(documented: &Documented, declaration: Node) {
    let scope = scope_of(documented, declaration);
    let context = documented.context;
    let class = super::parts::enclosing_class(context, scope);
    let links = Links { documented, scope, class, parameters: parameter_list(documented, declaration) };
    let _ = children;
    documented.doc.visit(&mut |tree, _| {
        if tree.kind == Kind::Inline && matches!(tree.name.as_str(), "link" | "linkplain") {
            links.link(tree);
        }
    });
    for (at, tree) in documented.doc.body.iter().enumerate() {
        if tree.kind == Kind::Erroneous {
            links.http(at, tree, documented.doc.body.get(at + 1));
        }
    }
}
