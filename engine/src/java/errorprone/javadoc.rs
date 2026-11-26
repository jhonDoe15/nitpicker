//! The checks that read doc comments: EmptyBlockTag, MissingSummary, InvalidBlockTag, UnescapedEntity; more in `doctagged`.
use super::Context;
use super::fixes::Fix;
use super::doc::{Comment, DocComment, Kind, Tree, parse};
use super::hierarchy::{annotation_names, declared_method, super_method};
use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "annotation_type_element_declaration"];

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Element {
    Class,
    Method,
    Variable,
}

pub(super) struct Documented<'a, 'c, 't> {
    pub context: &'c Context<'a>,
    /// The class, method, field declarator or enum constant.
    pub node: Node<'t>,
    /// Where javac says the declaration starts: its modifiers.
    pub start: usize,
    pub element: Element,
    pub comment: Comment,
    pub doc: DocComment,
}

impl Documented<'_, '_, '_> {
    pub fn source(&self, pos: usize) -> usize {
        self.comment.source_pos(pos).unwrap_or(self.start)
    }
    pub fn report(&self, check: &'static str, pos: usize, message: &str) {
        self.context.report(check, self.node, self.source(pos), message);
    }
    pub fn report_fixed(&self, check: &'static str, pos: usize, message: &str, fixes: &[Fix]) {
        self.context.report_fixed(check, self.node, self.source(pos), message, fixes);
    }
    /// Error Prone's `Utils.replace`: the tag's range replaced, no fix when javac gives it no end.
    pub fn replace(&self, tree: &Tree, text: &str) -> Fix {
        match (self.comment.source_pos(tree.pos), self.comment.source_pos(tree.end)) {
            (Some(start), Some(end)) => Fix::replace(start, end, text),
            _ => Fix::new(),
        }
    }
    /// The comment text between two positions, as the doc trees print it.
    pub fn printed(&self, from: usize, to: usize) -> String {
        self.comment.text.get(from..to).unwrap_or_default().iter().collect()
    }
    /// Reports where javac says the comment itself is; an empty comment has no place, so its declaration stands in.
    pub fn report_comment(&self, check: &'static str, message: &str) {
        self.report_comment_fixed(check, message, &[]);
    }
    pub fn report_comment_fixed(&self, check: &'static str, message: &str, fixes: &[Fix]) {
        self.context.report_fixed(check, self.node, self.doc.start.unwrap_or(self.start), message, fixes);
    }
}

/// The doc comment javac attaches to a declaration: the nearest one before its first token.
pub(super) fn comment_before<'t>(context: &Context, declaration: Node<'t>) -> Option<Node<'t>> {
    let mut current = declaration.prev_sibling();
    while let Some(at) = current {
        match at.kind() {
            "block_comment" if context.text(at).starts_with("/**") && !context.text(at).starts_with("/**/") => return Some(at),
            "block_comment" | "line_comment" => current = at.prev_sibling(),
            _ => return None,
        }
    }
    None
}

/// The doc comment javac attaches to a declaration, read.
pub(super) fn doc_of(context: &Context, declaration: Node) -> Option<(Comment, DocComment)> {
    let written = comment_before(context, declaration)?;
    let comment = Comment::of(context.text(written), written.start_byte())?;
    let doc = parse(&comment);
    Some((comment, doc))
}

pub fn javadoc(context: &Context, node: Node) {
    let (declaration, element) = match node.kind() {
        kind if TYPES.contains(&kind) => (node, Element::Class),
        kind if METHODS.contains(&kind) => (node, Element::Method),
        "enum_constant" => (node, Element::Variable),
        "variable_declarator" => match parent(node).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) {
            Some(holder) => (holder, Element::Variable),
            None => return,
        },
        _ => return,
    };
    let Some(written) = comment_before(context, declaration) else { return };
    let Some(comment) = Comment::of(context.text(written), written.start_byte()) else { return };
    let doc = parse(&comment);
    let documented = Documented { context, node, start: declaration.start_byte(), element, comment, doc };
    empty_block_tag(&documented);
    missing_summary(&documented, declaration);
    invalid_block_tag(&documented, declaration);
    unescaped_entity(&documented);
    super::doctagged::escaped_entity(&documented);
    super::doctagged::invalid_inline_tag(&documented, declaration);
    super::doc_throws::invalid_throws(&documented, declaration);
    super::docparams::invalid_param(&documented, declaration);
    super::doclinks::invalid_link(&documented, declaration);
    super::docinline::malformed_inline_tag(&documented);
    super::docinline::prefer_throws_tag(&documented);
    super::doc_misc::invalid_snippet(&documented);
    super::doc_misc::invalid_throws_link(&documented);
    super::doc_misc::unrecognised_javadoc_tag(&documented);
    super::doc_misc::url_in_see(&documented);
    super::doc_misc::inherit_doc(&documented, declaration);
}

fn empty_block_tag(documented: &Documented) {
    const TEXT: &str = "A block tag (@param, @return, @throws, @deprecated) has an empty description. Block tags without descriptions don't add \
                        much value for future readers of the code; consider removing the tag entirely or adding a description.";
    documented.doc.visit(&mut |tree, _| {
        let described = match tree.kind {
            Kind::Block => matches!(tree.name.as_str(), "param" | "return" | "throws" | "exception" | "deprecated"),
            Kind::Inline => tree.name == "return",
            _ => false,
        };
        if described && tree.description().is_empty() {
            let fix = if tree.name == "deprecated" { Fix::new() } else { documented.replace(tree, "") };
            documented.report_fixed("EmptyBlockTag", tree.pos, TEXT, &[fix]);
        }
    });
}

/// Public or protected as javac's symbol has it: members of interfaces and enum constants are public without saying so.
fn exposed(declaration: Node, node: Node) -> bool {
    if has_modifier(declaration, "public") || has_modifier(declaration, "protected") {
        return true;
    }
    let body = parent(declaration).map(|body| body.kind());
    node.kind() == "enum_constant"
        || (matches!(body, Some("interface_body" | "annotation_type_body")) && !has_modifier(declaration, "private"))
}

/// What Error Prone's `findFirst` gives: its scanner keeps only the result of the last node it scans at each level,
/// so a tag is found when it is the last block tag, or the last node inside the last one.
fn last_scanned<'t>(doc: &'t DocComment, wanted: &dyn Fn(&Tree) -> bool) -> Option<&'t Tree> {
    let mut current = doc.tags.last();
    while let Some(tree) = current {
        if wanted(tree) {
            return Some(tree);
        }
        current = if tree.is_block_tag() { tree.description().last() } else { tree.children.last() };
    }
    None
}

/// Error Prone's fix for a lone `@return`: its text moves to the front as a sentence.
fn returns_summary(documented: &Documented, tree: &Tree) -> Fix {
    let description = if tree.kind == Kind::Inline { documented.printed(tree.pos, tree.end) } else { printed_description(documented, tree, tree.children[0].pos) };
    let Some(first) = description.chars().next() else { return Fix::new() };
    let lowered: String = first.to_lowercase().chain(description.chars().skip(1)).collect();
    let stop = if description.ends_with('.') { "" } else { "." };
    summary_fix(documented, tree, &format!("Returns {lowered}{stop}\n"), false)
}

fn sees_summary(documented: &Documented, tree: &Tree) -> Fix {
    let reference: Vec<String> = tree.children[..tree.described].iter().map(|part| documented.printed(part.pos, part.end)).collect();
    summary_fix(documented, tree, &format!("See {{@link {}}}.\n", reference.join(" ")), true)
}

/// Where javac puts the start of the comment text: a text that starts with a line break starts after it.
fn summary_place(documented: &Documented) -> Option<usize> {
    let at = documented.comment.source_pos(0)?;
    if documented.comment.text.first() != Some(&'\n') {
        return Some(at);
    }
    let file = documented.context.file.text.as_bytes();
    Some(at + if file.get(at) == Some(&b'\r') && file.get(at + 1) == Some(&b'\n') { 2 } else { 1 })
}

/// How doc trees print what follows a block tag: `{@code x}` has one space after the name, whatever was written.
fn printed_description(documented: &Documented, tree: &Tree, from: usize) -> String {
    let mut out = String::new();
    let mut at = from;
    for part in tree.children.iter().filter(|part| part.pos >= from) {
        out.push_str(&documented.printed(at, part.pos));
        match (part.kind, part.children.first()) {
            (Kind::Inline, Some(body)) if matches!(part.name.as_str(), "code" | "literal") => {
                out.push_str(&format!("{{@{} {}}}", part.name, documented.printed(body.pos, body.end).trim_start_matches([' ', '\t'])));
            }
            (Kind::Inline, Some(reference)) if matches!(part.name.as_str(), "link" | "linkplain") => {
                let label = part.children.get(1).map(|label| format!(" {}", documented.printed(label.pos, part.children.last().map_or(label.end, |last| last.end)))).unwrap_or_default();
                out.push_str(&format!("{{@{} {}{label}}}", part.name, documented.printed(reference.pos, reference.end)));
            }
            _ => out.push_str(&documented.printed(part.pos, part.end)),
        }
        at = part.end;
    }
    out.push_str(&documented.printed(at, tree.end));
    out
}

fn summary_fix(documented: &Documented, tree: &Tree, text: &str, guarded: bool) -> Fix {
    let removal = documented.replace(tree, "");
    match summary_place(documented) {
        Some(at) if !(guarded && removal == Fix::new()) => removal.insert(at, text),
        _ => removal,
    }
}

fn missing_summary(documented: &Documented, declaration: Node) {
    const CHECK: &str = "MissingSummary";
    let context = documented.context;
    if !documented.doc.body.is_empty() || matches!(declaration.kind(), "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    if declaration.kind() == "method_declaration" {
        let Some((origin, declared)) = declared_method(context, declaration) else { return };
        if super_method(context, origin, declared).is_some() {
            return;
        }
    }
    if super::naming::effectively_private(documented.node) {
        return;
    }
    let returned = last_scanned(&documented.doc, &|tree| matches!(tree.kind, Kind::Block | Kind::Inline) && tree.name == "return");
    let seen = last_scanned(&documented.doc, &|tree| tree.kind == Kind::Block && tree.name == "see");
    let instead = |tag: &str| format!("A summary fragment is required; consider using the value of the @{tag} block as a summary fragment instead.");
    if let Some(tree) = returned.filter(|tree| tree.kind == Kind::Inline || !tree.children.is_empty()) {
        return documented.report_comment_fixed(CHECK, &instead("return"), &[returns_summary(documented, tree)]);
    }
    if let Some(tree) = seen {
        return documented.report_comment_fixed(CHECK, &instead("see"), &[sees_summary(documented, tree)]);
    }
    let marked = annotation_names(context, declaration).into_iter().any(|name| matches!(name, "Override" | "java.lang.Override" | "Deprecated" | "java.lang.Deprecated"));
    if exposed(declaration, documented.node) && !marked {
        documented.report_comment(CHECK, "A summary line is required on public/protected Javadocs.");
    }
}

const COMMON_BLOCKS: &[&str] = &["deprecated", "see", "since"];
const CLASS_BLOCKS: &[&str] = &["author", "param", "version"];
const VARIABLE_BLOCKS: &[&str] = &["serial", "serialData", "serialField"];
const METHOD_BLOCKS: &[&str] = &["author", "exception", "param", "return", "serial", "throws", "serialData", "serialField", "version"];
const INLINE_COMMON: &[&str] = &["code", "docRoot", "link", "linkplain", "literal", "snippet"];
const OTHER_BLOCKS: &[&str] = &["apiNote", "attr", "contact", "fails", "hide", "implNote", "implSpec", "removed", "required", "team"];

pub(super) fn edit_distance(from: &str, to: &str) -> usize {
    let (from, to): (Vec<char>, Vec<char>) = (from.chars().collect(), to.chars().collect());
    let mut row: Vec<usize> = (0..=to.len()).collect();
    for (at, letter) in from.iter().enumerate() {
        let mut next = vec![at + 1];
        for (place, other) in to.iter().enumerate() {
            next.push((usize::from(letter != other) + row[place]).min(row[place + 1] + 1).min(next[place] + 1));
        }
        row = next;
    }
    row[to.len()]
}

/// The parameters javac gives a method; a compact constructor gets the components of its record.
pub(super) fn parameter_names<'f>(context: &'f Context, method: Node) -> Vec<&'f str> {
    let header = if method.kind() == "compact_constructor_declaration" { parent(method).and_then(parent) } else { Some(method) };
    let list = header.and_then(|header| header.child_by_field_name("parameters")).map(children).unwrap_or_default();
    list.into_iter()
        .filter_map(|parameter| match parameter.kind() {
            "formal_parameter" => parameter.child_by_field_name("name"),
            "spread_parameter" => children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")),
            _ => None,
        })
        .map(|name| context.text(name))
        .collect()
}

fn invalid_block_tag(documented: &Documented, declaration: Node) {
    const CHECK: &str = "InvalidBlockTag";
    let own = match documented.element {
        Element::Class => CLASS_BLOCKS,
        Element::Method => METHOD_BLOCKS,
        Element::Variable => VARIABLE_BLOCKS,
    };
    let valid: Vec<&str> = COMMON_BLOCKS.iter().chain(own).copied().collect();
    let parameters = if documented.element == Element::Method { parameter_names(documented.context, declaration) } else { Vec::new() };
    let broken_code = documented.doc.body.iter().any(|tree| tree.kind == Kind::Erroneous && tree.name.starts_with("{@code"));
    let mut depth = 0i32;
    documented.doc.visit(&mut |tree, parent| {
        let name = tree.name.as_str();
        match tree.kind {
            Kind::StartElement if matches!(name, "code" | "pre") => depth += 1,
            Kind::EndElement if matches!(name, "code" | "pre") => depth -= 1,
            Kind::Erroneous if tree.code == "dc.bad.inline.tag" => {
                let inline = name.trim_start_matches('@');
                let fixed = INLINE_COMMON.contains(&inline) || (inline == "value") || (inline == "inheritDoc" && documented.element != Element::Variable);
                let fix = if fixed { documented.replace(tree, &format!("{{{name}}}")) } else { Fix::new() };
                documented.report_fixed(CHECK, tree.pos, &format!("{name} is not a valid block tag. Should it be an inline tag instead?"), &[fix]);
            }
            Kind::UnknownBlock if OTHER_BLOCKS.contains(&name) => {}
            Kind::UnknownBlock if depth > 0 && broken_code => {
                documented.report(CHECK, tree.pos, &format!("@{name} is interpreted as a block tag here, not as a literal."));
            }
            Kind::UnknownBlock if depth > 0 => {
                let text = format!(
                    "@{name} is not a valid block tag. Did you mean to escape it? Annotations must be escaped even within <pre> and <code>, \
                     but will be rendered correctly inside {{@code blocks."
                );
                let fix = documented.source(tree.pos);
                documented.report_fixed(CHECK, tree.pos, &text, &[Fix::replace(fix, fix + 1, "{@literal @}")]);
            }
            Kind::UnknownBlock if parameters.contains(&name) => {
                let text = format!("@{name} is not a valid tag, but is a parameter name. Use {{@code {name}}} to refer to parameter names inline.");
                let fix = documented.source(tree.pos);
                documented.report_fixed(CHECK, tree.pos, &text, &[Fix::replace(fix, fix + 1, "@param ")]);
            }
            Kind::UnknownBlock => {
                let mut best: Option<(&str, usize)> = None;
                for choice in &valid {
                    let distance = edit_distance(name, choice);
                    if distance < 2 && best.is_none_or(|(_, least)| distance < least) {
                        best = Some((choice, distance));
                    }
                }
                let at = documented.source(tree.pos) + 1;
                let (hint, fixes) = match best {
                    Some((choice, _)) => (format!(" Did you mean tag `{choice}`?"), vec![Fix::replace(at, at + name.len(), choice)]),
                    None => (" If this is a commonly-used custom tag, please click 'not useful' and file a bug.".to_string(), Vec::new()),
                };
                documented.report_fixed(CHECK, tree.pos, &format!("Tag name `{name}` is unknown.{hint}"), &fixes);
            }
            Kind::Block | Kind::Inline if tree.is_block_tag() && !valid.contains(&name) && !OTHER_BLOCKS.contains(&name) => {
                let message = format!("The tag @{name} is not allowed on this type of element.");
                let fixes = [documented.replace(tree, "")];
                match parent {
                    Some(parent) => documented.report_fixed(CHECK, parent.pos, &message, &fixes),
                    None => documented.report_comment_fixed(CHECK, &message, &fixes),
                }
            }
            _ => {}
        }
    });
}

static GENERIC: LazyLock<Regex> = LazyLock::new(|| {
    let kind = "[A-Z][a-zA-Z0-9_]*";
    let parameters = "[A-Z][A-Za-z0-9,.& ]+";
    Regex::new(&format!("({kind}<{parameters}>|{kind}<{kind}<{parameters}>>)")).expect("a pattern")
});
static SHOULD_NOT_WRAP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"&[a-zA-Z0-9]+;|&#[0-9]+;|&#x[0-9a-fA-F]+;|\n *\*\s*@|\{@(literal|code)").expect("a pattern"));

/// A range of file offsets; the upper end belongs to it when `closed`.
#[derive(Clone, Copy)]
struct Range {
    from: usize,
    to: usize,
    closed: bool,
}

impl Range {
    fn contains(&self, point: usize) -> bool {
        self.from <= point && (point < self.to || (self.closed && point == self.to))
    }
    fn intersects(&self, other: &Range) -> bool {
        let from = self.from.max(other.from);
        let to = self.to.min(other.to);
        from < to || (from == to && [self, other].iter().all(|range| range.to != to || range.closed))
    }
}

fn wrap_in_code(region: Range) -> Fix {
    Fix::new().insert(region.from, "{@code ").insert(region.to, "}")
}

fn unescaped_entity(documented: &Documented) {
    const CHECK: &str = "UnescapedEntity";
    let comment = &documented.comment;
    let source = |pos: usize| comment.source_pos(pos);
    let mut pre: Vec<Range> = Vec::new();
    let mut no_fix: Vec<Range> = Vec::new();
    let mut starts: Vec<usize> = Vec::new();
    let mut another = false;
    documented.doc.visit(&mut |tree, _| {
        let name = tree.name.as_str();
        match tree.kind {
            Kind::StartElement if matches!(name, "pre" | "code") => {
                starts.extend(source(tree.end_position()));
                another = false;
            }
            Kind::EndElement if matches!(name, "pre" | "code") => {
                if !another {
                    if let (Some(from), Some(to)) = (starts.pop(), source(tree.pos)) {
                        let inside = documented.context.file.text.get(from..to).unwrap_or_default();
                        let range = Range { from, to, closed: true };
                        if SHOULD_NOT_WRAP.is_match(inside) { no_fix.push(range) } else { pre.push(range) }
                    }
                }
                another = true;
            }
            Kind::Inline if matches!(name, "link" | "linkplain" | "literal" | "code") => {
                if let (Some(from), Some(to)) = (source(tree.pos), source(tree.end_position())) {
                    no_fix.push(Range { from, to, closed: true });
                }
            }
            Kind::Block if name == "see" => {
                if let (Some(from), Some(to)) = (source(tree.pos), source(tree.end_position())) {
                    no_fix.push(Range { from, to, closed: true });
                }
            }
            _ => {}
        }
    });
    let text: String = comment.text.iter().collect();
    let place = |byte: usize| text[..byte].chars().count();
    let mut generics: Vec<Range> = Vec::new();
    for found in GENERIC.find_iter(&text) {
        if let (Some(from), Some(to)) = (source(place(found.start())), source(place(found.end()))) {
            generics.push(Range { from, to, closed: false });
        }
    }
    let mut emitted: Vec<Range> = Vec::new();
    for range in &generics {
        if emitted.iter().chain(&no_fix).any(|other| other.intersects(range)) {
            continue;
        }
        let region = pre.iter().find(|around| around.contains(range.from)).copied().unwrap_or(*range);
        emitted.push(region);
        let text = "This looks like a type with type parameters. The < and > characters here will be interpreted as HTML, which can be \
                    avoided by wrapping it in a {@code } tag.";
        documented.context.report_fixed(CHECK, documented.node, range.from, text, &[wrap_in_code(region)]);
    }
    documented.doc.visit(&mut |tree, _| {
        if tree.kind != Kind::Erroneous || !matches!(tree.name.as_str(), "&" | "<" | ">") {
            return;
        }
        let Some(start) = source(tree.pos) else { return };
        if emitted.iter().any(|range| range.contains(start)) {
            return;
        }
        match pre.iter().find(|around| around.contains(start)).copied() {
            None => {
                if generics.iter().any(|range| range.contains(start)) {
                    let text = "Javadoc is interpreted as HTML, so HTML entities such as &, <, > must be escaped. If this finding seems wrong \
                                (e.g. is within a @code or @literal tag), check whether the tag could be malformed and not recognised by the \
                                compiler.";
                    let entity = match tree.name.as_str() {
                        "&" => "&amp;",
                        "<" => "&lt;",
                        _ => "&gt;",
                    };
                    documented.context.report_fixed(CHECK, documented.node, start, text, &[documented.replace(tree, entity)]);
                }
            }
            Some(around) => {
                if !emitted.iter().any(|range| range.intersects(&around)) {
                    emitted.push(around);
                    let text = "This HTML entity is invalid. Enclosing the code in this <pre>/<code> tag with a {@code } block will force \
                                Javadoc to interpret HTML literally.";
                    documented.context.report_fixed(CHECK, documented.node, start, text, &[wrap_in_code(around)]);
                }
            }
        }
    });
}
