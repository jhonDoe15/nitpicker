//! Doc comment checks about tags written inside the text: EscapedEntity, InvalidInlineTag.
use super::doc::{Kind, Tree};
use super::javadoc::{Documented, Element, edit_distance, parameter_names};
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

static HTML_ENTITY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)&[a-z0-9]+;|&#[0-9]+;|&#x[0-9a-f]+;").expect("a pattern"));

pub(super) fn escaped_entity(documented: &Documented) {
    const TEXT: &str = "HTML entities in @code/@literal tags will appear literally in the rendered javadoc.";
    documented.doc.visit(&mut |tree, _| {
        if tree.kind != Kind::Inline || !matches!(tree.name.as_str(), "code" | "literal") {
            return;
        }
        let Some(body) = tree.children.first() else { return };
        if HTML_ENTITY.is_match(&text_of(documented, body)) {
            documented.report("EscapedEntity", tree.pos, TEXT);
        }
    });
}

fn text_of(documented: &Documented, tree: &Tree) -> String {
    documented.comment.text[tree.pos..tree.end.min(documented.comment.text.len())].iter().collect()
}

const CHECK: &str = "InvalidInlineTag";
const INVALID: &str = "This tag is invalid.";
const KNOWN_INLINE: &[&str] = &["if"];
const CLASS_INLINE: &[&str] = &["code", "docRoot", "link", "linkplain", "literal", "snippet", "inheritDoc", "value"];
const VARIABLE_INLINE: &[&str] = &["code", "docRoot", "link", "linkplain", "literal", "snippet", "value"];
const CLASS_BLOCK: &[&str] = &["deprecated", "see", "since", "author", "param", "version"];
const VARIABLE_BLOCK: &[&str] = &["deprecated", "see", "since", "serial", "serialData", "serialField"];
const METHOD_BLOCK: &[&str] = &[
    "deprecated", "see", "since", "author", "exception", "param", "return", "serial", "throws", "serialData", "serialField", "version",
];
/// Inline tags javac reads into a tree of their own kind; `{@return}` is read as a return tag, which is not one of them.
const INLINE_TREES: &[&str] = &["code", "docRoot", "index", "inheritDoc", "link", "linkplain", "literal", "snippet", "summary", "systemProperty", "value"];

fn pattern(tags: &[&str], shape: &str) -> Regex {
    Regex::new(&shape.replace("TAGS", &tags.join("|"))).expect("a pattern")
}

static CLASS_CURLY: LazyLock<Regex> = LazyLock::new(|| pattern(CLASS_INLINE, r"@(TAGS)\{"));
static VARIABLE_CURLY: LazyLock<Regex> = LazyLock::new(|| pattern(VARIABLE_INLINE, r"@(TAGS)\{"));
static CLASS_PARENS: LazyLock<Regex> = LazyLock::new(|| pattern(CLASS_INLINE, r"\(@(TAGS)"));
static VARIABLE_PARENS: LazyLock<Regex> = LazyLock::new(|| pattern(VARIABLE_INLINE, r"\(@(TAGS)"));
static PARAM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{?@param ([a-zA-Z0-9]+)\}?").expect("a pattern"));
static ANCHORED_PARAM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\{?@param ([a-zA-Z0-9]+)\}?").expect("a pattern"));

struct Tags<'d, 'a, 'c, 't> {
    documented: &'d Documented<'a, 'c, 't>,
    declaration: Node<'t>,
    parameters: Vec<String>,
    inline: &'static [&'static str],
    block: &'static [&'static str],
}

pub(super) fn invalid_inline_tag(documented: &Documented, declaration: Node) {
    let (inline, block) = match documented.element {
        Element::Class => (CLASS_INLINE, CLASS_BLOCK),
        Element::Method => (CLASS_INLINE, METHOD_BLOCK),
        Element::Variable => (VARIABLE_INLINE, VARIABLE_BLOCK),
    };
    let parameters = if documented.element == Element::Method {
        parameter_names(documented.context, declaration).into_iter().map(String::from).collect()
    } else {
        Vec::new()
    };
    let tags = Tags { documented, declaration, parameters, inline, block };
    for tree in documented.doc.body.iter().chain(&documented.doc.tags) {
        tags.scan(tree, None);
    }
}

impl Tags<'_, '_, '_, '_> {
    fn report_at(&self, pos: usize, message: &str) {
        self.documented.report(CHECK, pos, message);
    }

    fn scan(&self, tree: &Tree, parent: Option<&Tree>) {
        let mut fixed = false;
        let mut deeper = true;
        match tree.kind {
            Kind::Erroneous => {
                deeper = false;
                if let Some(found) = ANCHORED_PARAM.captures(&tree.name) {
                    let name = &found[1];
                    if self.parameters.iter().any(|parameter| parameter == name) {
                        self.report_at(tree.pos, &format!("@param cannot be used inline to refer to parameters; {{@code {name}}} is recommended"));
                    }
                }
            }
            Kind::Text => self.text(tree),
            Kind::UnknownInline => match self.unknown_inline(tree) {
                None => deeper = false,
                Some(done) => fixed = done,
            },
            _ => {}
        }
        if deeper {
            for child in &tree.children {
                self.scan(child, Some(tree));
            }
        }
        let inline_tree = tree.kind == Kind::UnknownInline || (tree.kind == Kind::Inline && INLINE_TREES.contains(&tree.name.as_str()));
        if fixed || !inline_tree || self.inline.contains(&tree.name.as_str()) || KNOWN_INLINE.contains(&tree.name.as_str()) {
            return;
        }
        let message = format!("The tag @{} is not allowed on this type of element.", tree.name);
        match parent {
            Some(parent) => self.report_at(parent.pos, &message),
            None => self.documented.report_comment(CHECK, &message),
        }
    }

    fn text(&self, tree: &Tree) {
        let body = text_of(self.documented, tree);
        let place = |byte: usize| tree.pos + body[..byte].chars().count();
        let variable = self.documented.element == Element::Variable;
        let curly = if variable { &*VARIABLE_CURLY } else { &*CLASS_CURLY };
        for found in curly.find_iter(&body) {
            self.report_at(place(found.start()), INVALID);
        }
        let parens = if variable { &*VARIABLE_PARENS } else { &*CLASS_PARENS };
        for found in parens.captures_iter(&body) {
            let whole = found.get(0).expect("a match");
            self.report_at(place(whole.start()), &format!("Curly braces should be used for inline Javadoc tags: {{@{} ...}}", &found[1]));
        }
        for found in PARAM.find_iter(&body) {
            self.report_at(place(found.start()), INVALID);
        }
    }

    /// Reports an unknown inline tag; none when the tag is a known one and is not looked into, otherwise whether a
    /// finding more precise than "not allowed here" was given.
    fn unknown_inline(&self, tree: &Tree) -> Option<bool> {
        let name = tree.name.as_str();
        if KNOWN_INLINE.contains(&name) {
            return None;
        }
        if name == "param" {
            let file = &self.documented.context.file.text;
            let from = self.documented.source(tree.pos);
            let to = self.documented.source(tree.end).max(from);
            if let Some(found) = file.get(from..to).and_then(|written| PARAM.captures(written)) {
                let parameter = &found[1];
                if self.parameters.iter().any(|known| known == parameter) {
                    self.report_at(tree.pos, &format!("@param cannot be used inline to refer to parameters; {{@code {parameter}}} is recommended"));
                }
                return Some(true);
            }
        }
        if self.parameters.iter().any(|parameter| parameter == name) {
            let text = format!("@{name} is not a valid tag, but is a parameter name. Use {{@code {name}}} to refer to parameter names inline.");
            self.report_at(tree.pos, &text);
            return Some(true);
        }
        if self.probably_type(name) {
            let text = format!("The tag {{@{name}}} is not valid, and will not display or cross-link to the type {name} correctly. Prefer {{@link {name}}}.");
            self.report_at(tree.pos, &text);
            return Some(true);
        }
        if self.block.contains(&name) {
            self.report_at(tree.pos, &format!("Tag name `{name}` is not a valid inline tag, but it is a valid block tag."));
            return Some(true);
        }
        let mut best: Option<(&str, usize)> = None;
        for choice in self.inline {
            let distance = edit_distance(name, choice);
            if distance < 2 && best.is_none_or(|(_, least)| distance < least) {
                best = Some((choice, distance));
            }
        }
        let hint = match best {
            Some((choice, _)) => format!(" Did you mean tag `{choice}`?"),
            None => " If this is a commonly-used custom tag, please click 'not useful' and file a bug.".to_string(),
        };
        self.report_at(tree.pos, &format!("Tag name `{name}` is unknown.{hint}"));
        Some(true)
    }

    fn probably_type(&self, name: &str) -> bool {
        if name.matches('.').count() >= 3 || name.contains('#') {
            return true;
        }
        let first = name.split('.').next().unwrap_or(name);
        let context = self.documented.context;
        if first.is_empty() {
            return false;
        }
        crate::java::types::scope::type_parameter(context.file, self.declaration, first).is_some()
            || context.resolver.class_name(self.declaration, first).is_some()
    }
}
