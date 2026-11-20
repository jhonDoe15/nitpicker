//! The checks that read doc comments: EmptyBlockTag, MissingSummary, InvalidBlockTag, UnescapedEntity.
use super::Context;
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
enum Element {
    Class,
    Method,
    Variable,
}

struct Documented<'a, 'c, 't> {
    context: &'c Context<'a>,
    /// The class, method, field declarator or enum constant.
    node: Node<'t>,
    /// Where javac says the declaration starts: its modifiers.
    start: usize,
    element: Element,
    comment: Comment,
    doc: DocComment,
}

impl Documented<'_, '_, '_> {
    fn source(&self, pos: usize) -> usize {
        self.comment.source_pos(pos).unwrap_or(self.start)
    }
    fn report(&self, check: &'static str, pos: usize, message: &str) {
        self.context.report(check, self.node, self.source(pos), message);
    }
}

/// The doc comment javac attaches to a declaration: the nearest one before its first token.
fn comment_before<'t>(context: &Context, declaration: Node<'t>) -> Option<Node<'t>> {
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
}

fn empty_block_tag(documented: &Documented) {
    const TEXT: &str = "A block tag (@param, @return, @throws, @deprecated) has an empty description. Block tags without descriptions don't add \
                        much value for future readers of the code; consider removing the tag entirely or adding a description.";
    documented.doc.visit(&mut |tree| {
        let described = match tree.kind {
            Kind::Block => matches!(tree.name.as_str(), "param" | "return" | "throws" | "exception" | "deprecated"),
            Kind::Inline => tree.name == "return",
            _ => false,
        };
        if described && tree.description().is_empty() {
            documented.report("EmptyBlockTag", tree.pos, TEXT);
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
    if returned.is_some_and(|tree| tree.kind == Kind::Inline || !tree.children.is_empty()) {
        return documented.report(CHECK, documented.doc.pos, &instead("return"));
    }
    if seen.is_some() {
        return documented.report(CHECK, documented.doc.pos, &instead("see"));
    }
    let marked = annotation_names(context, declaration).into_iter().any(|name| matches!(name, "Override" | "java.lang.Override" | "Deprecated" | "java.lang.Deprecated"));
    if exposed(declaration, documented.node) && !marked {
        documented.report(CHECK, documented.doc.pos, "A summary line is required on public/protected Javadocs.");
    }
}

const COMMON_BLOCKS: &[&str] = &["deprecated", "see", "since"];
const CLASS_BLOCKS: &[&str] = &["author", "param", "version"];
const VARIABLE_BLOCKS: &[&str] = &["serial", "serialData", "serialField"];
const METHOD_BLOCKS: &[&str] = &["author", "exception", "param", "return", "serial", "throws", "serialData", "serialField", "version"];
const OTHER_BLOCKS: &[&str] = &["apiNote", "attr", "contact", "fails", "hide", "implNote", "implSpec", "removed", "required", "team"];

fn edit_distance(from: &str, to: &str) -> usize {
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

fn parameter_names<'f>(context: &'f Context, method: Node) -> Vec<&'f str> {
    let list = method.child_by_field_name("parameters").map(children).unwrap_or_default();
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
    documented.doc.visit(&mut |tree| {
        let name = tree.name.as_str();
        match tree.kind {
            Kind::StartElement if matches!(name, "code" | "pre") => depth += 1,
            Kind::EndElement if matches!(name, "code" | "pre") => depth -= 1,
            Kind::Erroneous if tree.code == "dc.bad.inline.tag" => {
                documented.report(CHECK, tree.pos, &format!("{name} is not a valid block tag. Should it be an inline tag instead?"));
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
                documented.report(CHECK, tree.pos, &text);
            }
            Kind::UnknownBlock if parameters.contains(&name) => {
                let text = format!("@{name} is not a valid tag, but is a parameter name. Use {{@code {name}}} to refer to parameter names inline.");
                documented.report(CHECK, tree.pos, &text);
            }
            Kind::UnknownBlock => {
                let mut best: Option<(&str, usize)> = None;
                for choice in &valid {
                    let distance = edit_distance(name, choice);
                    if distance < 2 && best.is_none_or(|(_, least)| distance < least) {
                        best = Some((choice, distance));
                    }
                }
                let hint = match best {
                    Some((choice, _)) => format!(" Did you mean tag `{choice}`?"),
                    None => " If this is a commonly-used custom tag, please click 'not useful' and file a bug.".to_string(),
                };
                documented.report(CHECK, tree.pos, &format!("Tag name `{name}` is unknown.{hint}"));
            }
            Kind::Block | Kind::Inline if tree.is_block_tag() && !valid.contains(&name) && !OTHER_BLOCKS.contains(&name) => {
                documented.report(CHECK, tree.pos, &format!("The tag @{name} is not allowed on this type of element."));
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

fn unescaped_entity(documented: &Documented) {
    const CHECK: &str = "UnescapedEntity";
    let comment = &documented.comment;
    let source = |pos: usize| comment.source_pos(pos);
    let mut pre: Vec<Range> = Vec::new();
    let mut no_fix: Vec<Range> = Vec::new();
    let mut starts: Vec<usize> = Vec::new();
    let mut another = false;
    documented.doc.visit(&mut |tree| {
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
        emitted.push(pre.iter().find(|around| around.contains(range.from)).copied().unwrap_or(*range));
        let text = "This looks like a type with type parameters. The < and > characters here will be interpreted as HTML, which can be \
                    avoided by wrapping it in a {@code } tag.";
        documented.context.report(CHECK, documented.node, range.from, text);
    }
    documented.doc.visit(&mut |tree| {
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
                    documented.context.report(CHECK, documented.node, start, text);
                }
            }
            Some(around) => {
                if !emitted.iter().any(|range| range.intersects(&around)) {
                    emitted.push(around);
                    let text = "This HTML entity is invalid. Enclosing the code in this <pre>/<code> tag with a {@code } block will force \
                                Javadoc to interpret HTML literally.";
                    documented.context.report(CHECK, documented.node, start, text);
                }
            }
        }
    });
}
