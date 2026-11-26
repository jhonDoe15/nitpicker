//! InvalidSnippet, InvalidThrowsLink, UnrecognisedJavadocTag, UrlInSee and InheritDoc: checks on doc comments.
use super::comparable_checks::written_supertypes;
use super::doc::Kind;
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::javadoc::{Documented, Element};
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

static THROWS_LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^@throws \{@(?:link|code) ([^}]+)\}").unwrap());
static TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{@(code|link)").unwrap());

pub(super) fn invalid_snippet(documented: &Documented) {
    let message = "This @snippet tag looks to be malformed. Did you forget the \":\"? Snippets should start with \"{@snippet :\" followed by a newline.";
    documented.doc.visit(&mut |tree, _| {
        if tree.kind == Kind::Erroneous && tree.name.starts_with("{@snippet") {
            documented.report_fixed("InvalidSnippet", tree.pos, message, &[]);
        }
    });
}

pub(super) fn invalid_throws_link(documented: &Documented) {
    if documented.element != Element::Method {
        return;
    }
    let message = "Don't use {@link} or {@code} in @throws tags; mention the exception name directly (e.g., @throws IOException, not @throws {@link IOException}).";
    documented.doc.visit(&mut |tree, _| {
        if tree.kind != Kind::Erroneous {
            return;
        }
        let Some(found) = THROWS_LINK.captures(&tree.name) else { return };
        let (Some(whole), Some(name)) = (found.get(0), found.get(1)) else { return };
        let end = tree.pos + tree.name[..whole.end()].chars().count();
        let (Some(from), Some(to)) = (documented.comment.source_pos(tree.pos), documented.comment.source_pos(end)) else { return };
        let fix = Fix::replace(from, to, format!("@throws {}", name.as_str()));
        documented.context.report_fixed("InvalidThrowsLink", documented.node, from, message, &[fix]);
    });
}

pub(super) fn unrecognised_javadoc_tag(documented: &Documented) {
    let mut recognised: Vec<(usize, usize)> = Vec::new();
    documented.doc.visit(&mut |tree, _| {
        let tag = tree.kind == Kind::Inline && (matches!(tree.name.as_str(), "link" | "linkplain") || tree.name == "code");
        if tag {
            if let (Some(from), Some(to)) = (documented.comment.source_pos(tree.pos), documented.comment.source_pos(tree.end_position())) {
                recognised.push((from, to));
            }
        }
    });
    let text: String = documented.comment.text.iter().collect();
    let message = "This Javadoc tag wasn't recognised by the parser. Is it malformed somehow, perhaps with mismatched braces?";
    let mut seen: Vec<usize> = Vec::new();
    for found in TAG.find_iter(&text) {
        let Some(at) = documented.comment.source_pos(text[..found.start()].chars().count()) else { continue };
        if seen.contains(&at) || recognised.iter().any(|(from, to)| *from <= at && at < *to) {
            continue;
        }
        seen.push(at);
        documented.context.report_fixed("UnrecognisedJavadocTag", documented.node, at, message, &[]);
    }
}

pub(super) fn url_in_see(documented: &Documented) {
    let message = "URLs should not be used in @see tags; they are designed for Java elements which could be used with @link.";
    documented.doc.visit(&mut |tree, _| {
        if tree.kind == Kind::Erroneous && tree.name.starts_with("@see http") {
            let fix = documented.replace(tree, &tree.name.replacen("@see", "See", 1));
            documented.report_fixed("UrlInSee", tree.pos, message, &[fix]);
        }
    });
}

pub(super) fn inherit_doc(documented: &Documented, declaration: Node) {
    let context = documented.context;
    let reason = match documented.element {
        Element::Variable => Some("@inheritDoc doesn't make sense on variables as they cannot override a super element."),
        Element::Method => {
            let Some((origin, declared)) = declared_method(context, declaration) else { return };
            super_methods(context.resolver.index, origin, declared).is_empty().then_some("This method does not override anything to inherit documentation from.")
        }
        Element::Class => written_supertypes(declaration).is_empty().then_some("This class does not extend or implement anything to inherit documentation from."),
    };
    let Some(reason) = reason else { return };
    documented.doc.visit(&mut |tree, _| {
        if tree.kind == Kind::Inline && tree.name == "inheritDoc" {
            documented.report_fixed("InheritDoc", tree.pos, reason, &[]);
        }
    });
}
