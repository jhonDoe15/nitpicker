//! Checks on how things are named and imported.
use super::Context;
use crate::engine::source::children;
use tree_sitter::Node;

/// The terms of a Java name: split at underscores, at a lower-to-upper step and before trailing digits, in lower case.
pub fn lowercase_terms(name: &str) -> Vec<String> {
    if !name.is_empty() && name.chars().all(|letter| letter == '_') {
        return vec![name.to_string()];
    }
    let letters: Vec<char> = name.chars().collect();
    let digits_from = letters.len() - letters.iter().rev().take_while(|letter| letter.is_ascii_digit()).count();
    let mut terms = vec![String::new()];
    for (at, letter) in letters.iter().enumerate() {
        let before = at.checked_sub(1).map(|index| letters[index]);
        let step = before.is_some_and(|before| (before.is_ascii_lowercase() || before.is_ascii_digit()) && letter.is_ascii_uppercase());
        let digits = at == digits_from && at < letters.len() && before.is_some_and(|before| !before.is_ascii_digit() && before != '_');
        if *letter == '_' || step || digits {
            terms.push(String::new());
        }
        if *letter != '_' {
            terms.last_mut().expect("a term").extend(letter.to_lowercase());
        }
    }
    terms.retain(|term| !term.is_empty());
    terms
}

fn upper_first(term: &str) -> String {
    let mut letters = term.chars();
    letters.next().map(|first| first.to_ascii_uppercase().to_string() + letters.as_str()).unwrap_or_default()
}

pub fn type_parameter_naming(context: &Context, node: Node) {
    if node.kind() != "type_parameter" {
        return;
    }
    let Some(name_node) = children(node).into_iter().find(|part| matches!(part.kind(), "type_identifier" | "identifier")) else { return };
    let name = context.text(name_node);
    let mut letters = name.chars();
    let single = letters.next().is_some_and(|first| first.is_ascii_uppercase()) && letters.all(|rest| rest.is_ascii_digit());
    if single {
        return;
    }
    let message = if name.ends_with('T') {
        if lowercase_terms(name).iter().map(|term| upper_first(term)).collect::<String>() == name {
            return;
        }
        format!("Type Parameters should be an UpperCamelCase name followed by the letter 'T'. {name} ends in T, but is not a valid UpperCamelCase name")
    } else {
        format!("Type Parameter {name} must be a single letter with an optional numeric suffix, or an UpperCamelCase name followed by the letter 'T'.")
    };
    context.report("TypeParameterNaming", node, name_node.start_byte(), &message);
}

pub fn wildcard_import(context: &Context, node: Node) {
    if node.kind() != "program" {
        return;
    }
    let first = children(node)
        .into_iter()
        .find(|part| part.kind() == "import_declaration" && children(*part).iter().any(|inner| inner.kind() == "asterisk"));
    if let Some(first) = first {
        context.report("WildcardImport", first, first.start_byte(), "Wildcard imports, static or otherwise, should not be used");
    }
}

const UNEXPLAINED: &str = "Use of @SuppressWarnings should be accompanied by a comment describing why the warning is safe to ignore.";

pub fn suppress_warnings_without_explanation(context: &Context, node: Node) {
    if node.kind() != "annotation" {
        return;
    }
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "SuppressWarnings" | "java.lang.SuppressWarnings") {
        return;
    }
    let Some(arguments) = node.child_by_field_name("arguments") else { return };
    let mut named = false;
    crate::engine::source::walk(arguments, |part| {
        if part.kind() == "string_literal" {
            let value = crate::java::types::expr::literal_text(context.file, part).unwrap_or_default();
            named |= matches!(value.as_str(), "deprecation" | "rawtypes" | "unchecked");
        }
    });
    let Some(holder) = crate::engine::source::parent(node).filter(|_| named) else { return };
    let (first, last) = (context.line_of(holder.start_byte()), context.line_of(holder.end_byte().saturating_sub(1)));
    let mut explained = false;
    crate::engine::source::walk(context.file.tree.root_node(), |part| {
        if part.kind().ends_with("comment") {
            let (from, to) = (context.line_of(part.start_byte()), context.line_of(part.end_byte().saturating_sub(1)));
            explained |= from <= last + 1 && to + 1 >= first;
        }
    });
    if !explained {
        context.report("SuppressWarningsWithoutExplanation", node, node.start_byte(), UNEXPLAINED);
    }
}

const UNUSED_IN_FORMALS: &str = "Declaring a type parameter that is only used in the return type is a misuse of generics: operations on the type parameter are unchecked, it hides unsafe casts at invocations of the method, and it interacts badly with method overload resolution.";

fn mentions(context: &Context, kind: Node, wanted: &str, own: &[(String, Node)], seen: &mut Vec<String>) -> bool {
    let mut found = false;
    let mut next = Vec::new();
    crate::engine::source::walk(kind, |part| {
        if part.kind() == "type_identifier" {
            let name = context.text(part);
            found |= name == wanted;
            if let Some((_, parameter)) = own.iter().find(|(other, _)| other == name) {
                if !seen.iter().any(|done| done == name) {
                    seen.push(name.to_string());
                    next.push(*parameter);
                }
            }
        }
    });
    found || next.into_iter().any(|parameter| {
        children(parameter).into_iter().filter(|part| part.kind() == "type_bound").any(|bound| mentions(context, bound, wanted, own, seen))
    })
}

pub fn type_parameter_unused_in_formals(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let (Some(list), Some(returns), Some(name)) =
        (node.child_by_field_name("type_parameters"), node.child_by_field_name("type"), node.child_by_field_name("name"))
    else {
        return;
    };
    let returned = match returns.kind() {
        "type_identifier" => returns,
        "annotated_type" => match children(returns).into_iter().rfind(|part| part.is_named()) {
            Some(inner) if inner.kind() == "type_identifier" => inner,
            _ => return,
        },
        _ => return,
    };
    if node.child_by_field_name("dimensions").is_some() {
        return;
    }
    let own: Vec<(String, Node)> = children(list)
        .into_iter()
        .filter(|part| part.kind() == "type_parameter")
        .filter_map(|part| {
            let name = children(part).into_iter().find(|inner| matches!(inner.kind(), "type_identifier" | "identifier"))?;
            Some((context.text(name).to_string(), part))
        })
        .collect();
    let wanted = context.text(returned);
    let Some((_, parameter)) = own.iter().find(|(other, _)| other == wanted) else { return };
    let bounded = children(*parameter)
        .into_iter()
        .filter(|part| part.kind() == "type_bound")
        .any(|bound| mentions(context, bound, wanted, &own, &mut vec![wanted.to_string()]));
    let used = node.child_by_field_name("parameters").is_some_and(|formals| mentions(context, formals, wanted, &own, &mut Vec::new()));
    if !bounded && !used {
        context.report("TypeParameterUnusedInFormals", node, name.start_byte(), UNUSED_IN_FORMALS);
    }
}

const CHAINS: &[&str] = &["scoped_type_identifier", "scoped_identifier", "field_access"];
const BAD_NESTED: &[&str] = &["Builder", "BuilderFactory", "Callback", "Class", "Enum", "Factory", "Type", "Key", "Id", "Provider"];

fn dotted(context: &Context, node: Node) -> Option<String> {
    let text: String = context.text(node).chars().filter(|letter| !letter.is_whitespace()).collect();
    let plain = !text.is_empty() && text.split('.').all(|part| !part.is_empty() && part.chars().all(|letter| letter.is_alphanumeric() || matches!(letter, '_' | '$')));
    plain.then_some(text)
}

fn chain_class(context: &Context, node: Node) -> Option<String> {
    if !CHAINS.contains(&node.kind()) {
        return None;
    }
    let name = dotted(context, node)?;
    let first = name.split('.').next().unwrap_or_default();
    let leftmost = {
        let mut at = node;
        while let Some(inner) = at.named_child(0).filter(|_| CHAINS.contains(&at.kind())) {
            at = inner;
        }
        at
    };
    if context.resolver.is_variable(leftmost, first) || context.resolver.class_name(node, first).is_some() {
        return None;
    }
    let index = context.resolver.index;
    let parts: Vec<&str> = name.split('.').collect();
    let top = (1..=parts.len()).find(|count| index.has(&parts[..*count].join(".")))?;
    let mut class = parts[..top].join(".");
    for part in &parts[top..] {
        class = index.lineage(&class).into_iter().map(|above| format!("{above}.{part}")).find(|candidate| index.has(candidate))?;
    }
    Some(class)
}

/// What a simple name means where the node stands: a variable hides a class.
fn meaning(context: &Context, at: Node, name: &str) -> Option<String> {
    if context.resolver.is_variable(at, name) {
        return Some(String::new());
    }
    let class = context.resolver.class_name(at, name)?;
    let scope = context.resolver.scope;
    let starred = !scope.single.contains_key(name)
        && class.strip_suffix(name).is_some_and(|package| scope.on_demand.iter().any(|other| format!("{other}.") == package))
        && class != format!("java.lang.{name}")
        && context.resolver.index.has(&format!("java.lang.{name}"));
    Some(if starred { String::new() } else { class })
}

pub fn unnecessarily_fully_qualified(context: &Context, node: Node) {
    if node.kind() != "program" || context.file.path.ends_with("package-info.java") {
        return;
    }
    let mut order: Vec<String> = Vec::new();
    let mut found: std::collections::HashMap<String, Vec<(String, Node)>> = std::collections::HashMap::new();
    let mut seen: Vec<(Node, bool)> = Vec::new();
    crate::engine::source::walk(node, |part| {
        let holder = crate::engine::source::parent(part);
        if matches!(part.kind(), "identifier" | "type_identifier") {
            let inside = holder.is_some_and(|holder| CHAINS.contains(&holder.kind()) && holder.named_child(0) != Some(part));
            if !inside {
                seen.push((part, holder.is_some_and(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("name") == Some(part))));
            }
            return;
        }
        if !CHAINS.contains(&part.kind()) || crate::engine::source::ancestor(part, &["import_declaration", "package_declaration"]).is_some() {
            return;
        }
        let ignored = holder.is_some_and(|holder| holder.named_child(0) == Some(part) && chain_class(context, holder).is_some());
        if ignored {
            return;
        }
        let mut at = part;
        loop {
            let Some(text) = dotted(context, at) else { return };
            let last = text.rsplit('.').next().unwrap_or_default();
            if BAD_NESTED.contains(&last) && chain_class(context, at).is_some() || BAD_NESTED.contains(&last) && at.kind() == "field_access" {
                match at.named_child(0).filter(|inner| CHAINS.contains(&inner.kind())) {
                    Some(inner) => at = inner,
                    None => return,
                }
                continue;
            }
            break;
        }
        let Some(class) = chain_class(context, at) else { return };
        if context.suppressed("UnnecessarilyFullyQualified", at) {
            return;
        }
        let simple = class.rsplit('.').next().unwrap_or_default().to_string();
        if !found.contains_key(&simple) {
            order.push(simple.clone());
        }
        let shared = crate::engine::source::ancestor(at, &["field_declaration", "local_variable_declaration"])
            .filter(|holder| holder.child_by_field_name("type").is_some_and(|kind| kind.start_byte() <= at.start_byte() && at.end_byte() <= kind.end_byte()))
            .map_or(1, |holder| children(holder).into_iter().filter(|part| part.kind() == "variable_declarator").count());
        let component = crate::engine::source::ancestor(at, &["record_declaration", "block", "class_body"]).is_some_and(|holder| {
            holder.kind() == "record_declaration" && holder.child_by_field_name("parameters").is_some_and(|list| list.end_byte() >= at.end_byte())
                && holder.child_by_field_name("body").is_some_and(|body| children(body).iter().any(|member| member.kind() == "compact_constructor_declaration"))
        });
        for _ in 0..if component { 2 } else { shared.max(1) } {
            found.entry(simple.clone()).or_default().push((class.clone(), at));
        }
    });
    for simple in order {
        let uses = &found[&simple];
        let class = &uses[0].0;
        if uses.iter().any(|(other, _)| other != class) || simple.starts_with(|first: char| first.is_ascii_lowercase()) || simple == "Annotation" {
            continue;
        }
        let clash = seen.iter().filter(|(other, _)| context.text(*other) == simple).any(|(other, call)| {
            *call || match other.kind() {
                "type_identifier" => context.resolver.class_name(*other, &simple).as_ref() != Some(class),
                _ if context.resolver.is_variable(*other, &simple) => {
                    !matches!(context.resolver.type_of(*other), Some(crate::java::types::model::Type::Class(name, _)) if &name == class)
                }
                _ => context.resolver.class_name(*other, &simple).is_some_and(|name| &name != class),
            }
        });
        if clash || uses.iter().any(|(_, at)| meaning(context, *at, &simple).is_some_and(|name| &name != class)) {
            continue;
        }
        let message = format!("The fully qualified name '{class}' is unambiguous to the compiler if imported, prefer using the name '{simple}'.");
        for (_, at) in uses {
            let dot = children(*at).into_iter().filter(|part| part.kind() == ".").next_back().map_or(at.start_byte(), |dot| dot.start_byte());
            context.report("UnnecessarilyFullyQualified", *at, dot, &message);
        }
    }
}
