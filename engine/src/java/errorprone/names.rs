//! Checks on how things are named and imported.
use super::fixes::Fix;
use super::{Context, namefixes, typevars};
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

pub fn type_parameter_naming(context: &Context, node: Node) {
    if node.kind() != "type_parameter" {
        return;
    }
    let Some(name_node) = children(node).into_iter().find(|part| matches!(part.kind(), "type_identifier" | "identifier")) else { return };
    let name = context.text(name_node);
    if typevars::valid_name(name) {
        return;
    }
    let message = if name.ends_with('T') {
        format!("Type Parameters should be an UpperCamelCase name followed by the letter 'T'. {name} ends in T, but is not a valid UpperCamelCase name")
    } else {
        format!("Type Parameter {name} must be a single letter with an optional numeric suffix, or an UpperCamelCase name followed by the letter 'T'.")
    };
    let Some(owner) = crate::engine::source::parent(node).and_then(crate::engine::source::parent) else { return };
    let mut fixes = Vec::new();
    if !typevars::non_class_name_with_t(name) {
        fixes.push(typevars::rename(context, owner, node, name, &typevars::followed_with_t(name)));
    }
    fixes.push(typevars::rename(context, owner, node, name, &typevars::single_letter(context, owner, name)));
    context.report_fixed("TypeParameterNaming", node, name_node.start_byte(), &message, &fixes);
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
    let typed = node.kind() == "scoped_type_identifier";
    if (!typed && context.resolver.is_variable(leftmost, first)) || context.resolver.class_name(node, first).is_some() {
        return None;
    }
    let index = context.resolver.index;
    let parts: Vec<&str> = name.split('.').collect();
    let top = (1..=parts.len()).find(|count| index.has(&parts[..*count].join(".")))?;
    let mut class = parts[..top].join(".");
    for part in &parts[top..] {
        class = index.lineage(&class).iter().map(|above| format!("{above}.{part}")).find(|candidate| index.has(candidate))?;
    }
    Some(class)
}

/// What a simple name means where the node stands: a variable hides a class; a resource is not seen in its own declaration.
fn meaning(context: &Context, at: Node, name: &str) -> Option<String> {
    let seen_from = crate::engine::source::ancestor(at, &["resource", "block"]).filter(|holder| holder.kind() == "resource").unwrap_or(at);
    if context.resolver.is_variable(seen_from, name) {
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
        for _ in 0..visits(at) {
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
        let mut fix = uses.iter().fold(Fix::new(), |fix, (_, at)| fix.and(at.start_byte(), at.end_byte(), simple.as_str()));
        if uses.iter().any(|(_, at)| meaning(context, *at, &simple).is_none()) {
            fix = fix.with_imports();
        }
        for (_, at) in uses {
            let dot = children(*at).into_iter().filter(|part| part.kind() == ".").next_back().map_or(at.start_byte(), |dot| dot.start_byte());
            context.report_fixed("UnnecessarilyFullyQualified", *at, dot, &message, std::slice::from_ref(&fix));
        }
    }
}

/// How often javac's tree holds this type: declarators of one declaration share their type, and a record with a
/// compact constructor gives each component's type to the field and to the parameter.
fn visits(at: Node) -> usize {
    let component = crate::engine::source::ancestor(at, &["record_declaration", "block", "class_body"]).is_some_and(|holder| {
        holder.kind() == "record_declaration"
            && holder.child_by_field_name("parameters").is_some_and(|list| list.end_byte() >= at.end_byte())
            && holder.child_by_field_name("body").is_some_and(|body| children(body).iter().any(|member| member.kind() == "compact_constructor_declaration"))
    });
    if component {
        return 2;
    }
    crate::engine::source::ancestor(at, &["field_declaration", "local_variable_declaration"])
        .filter(|holder| holder.child_by_field_name("type").is_some_and(|kind| kind.start_byte() <= at.start_byte() && at.end_byte() <= kind.end_byte()))
        .map_or(1, |holder| children(holder).into_iter().filter(|part| part.kind() == "variable_declarator").count().max(1))
}

/// The class a name or a dotted chain stands for, with the name as written.
pub(super) fn named_class(context: &Context, node: Node) -> Option<(String, String)> {
    if let Some(known) = context.named.borrow().get(&node.id()) {
        return known.clone();
    }
    let found = read_named_class(context, node);
    context.named.borrow_mut().insert(node.id(), found.clone());
    found
}

fn read_named_class(context: &Context, node: Node) -> Option<(String, String)> {
    let written = dotted(context, node)?;
    let first = written.split('.').next().unwrap_or_default();
    let index = context.resolver.index;
    let parts: Vec<&str> = written.split('.').collect();
    let (mut class, rest) = match context.resolver.class_name(node, first).filter(|name| index.has(name)) {
        Some(class) => (class, &parts[1..]),
        None => {
            let top = (1..=parts.len()).find(|count| index.has(&parts[..*count].join(".")))?;
            (parts[..top].join("."), &parts[top..])
        }
    };
    let mut leftmost = node;
    while let Some(inner) = leftmost.named_child(0).filter(|_| CHAINS.contains(&leftmost.kind())) {
        leftmost = inner;
    }
    if context.resolver.is_variable(leftmost, first) {
        return None;
    }
    for part in rest {
        class = index.lineage(&class).iter().map(|above| format!("{above}.{part}")).find(|candidate| index.has(candidate))?;
    }
    Some((written, class))
}

pub fn same_name_but_different(context: &Context, node: Node) {
    if node.kind() != "program" {
        return;
    }
    let mut order: Vec<String> = Vec::new();
    let mut table: std::collections::HashMap<String, Vec<(String, Vec<Node>)>> = std::collections::HashMap::new();
    crate::engine::source::walk(node, |part| {
        let chain = CHAINS.contains(&part.kind());
        if !chain && !matches!(part.kind(), "identifier" | "type_identifier") {
            return;
        }
        if crate::engine::source::ancestor(part, &["import_declaration", "package_declaration"]).is_some() {
            return;
        }
        let Some(holder) = crate::engine::source::parent(part) else { return };
        if CHAINS.contains(&holder.kind()) && (holder.named_child(0) != Some(part) || named_class(context, holder).is_some()) {
            return;
        }
        let referenced = holder.kind() == "method_reference" && holder.named_child(0) == Some(part);
        if part.kind() == "identifier" && !referenced && !super::values::value_name(part) && !matches!(holder.kind(), "annotation" | "marker_annotation") {
            return;
        }
        if !chain && context.text(part) == "Builder" {
            return;
        }
        let Some((written, class)) = named_class(context, part) else { return };
        if !chain && crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, part).as_deref() == Some(class.as_str()) {
            return;
        }
        if context.suppressed("SameNameButDifferent", part) {
            return;
        }
        if !table.contains_key(&written) {
            order.push(written.clone());
        }
        let row = table.entry(written).or_default();
        let cell = match row.iter().position(|(other, _)| *other == class) {
            Some(at) => at,
            None => {
                row.push((class, Vec::new()));
                row.len() - 1
            }
        };
        let anonymous = crate::engine::source::ancestor(part, &["object_creation_expression", "block", "class_body"]).is_some_and(|holder| {
            holder.kind() == "object_creation_expression"
                && children(holder).iter().any(|child| child.kind() == "class_body")
                && holder.child_by_field_name("type").is_some_and(|kind| kind.start_byte() <= part.start_byte() && part.end_byte() <= kind.end_byte())
        });
        for _ in 0..visits(part) * if anonymous { 2 } else { 1 } {
            row[cell].1.push(part);
        }
    });
    for written in order {
        if table[&written].len() < 2 {
            continue;
        }
        let local = |class: &str| class.rsplit('.').next().is_some_and(|last| last.starts_with(|first: char| first.is_ascii_digit()));
        let row: Vec<&(String, Vec<Node>)> =
            table[&written].iter().filter(|(class, uses)| !local(class) || uses.iter().any(|at| CHAINS.contains(&at.kind()))).collect();
        if row.len() < 2 {
            continue;
        }
        let classes: Vec<&str> = row.iter().map(|(class, _)| class.as_str()).collect();
        let message = format!(
            "The name `{written}` refers to [{}] within this file. It may be confusing to have the same name refer to multiple types. Consider qualifying them for clarity.",
            classes.join(", ")
        );
        let mut imports = false;
        let mut fix = Fix::new();
        for (class, uses) in &row {
            for at in uses {
                fix = namefixes::qualify(context, fix, *at, class, &written, &mut imports);
            }
        }
        if imports {
            fix = fix.with_imports();
        }
        for (_, uses) in row {
            for at in uses {
                let offset = if CHAINS.contains(&at.kind()) {
                    children(*at).into_iter().filter(|part| part.kind() == ".").next_back().map_or(at.start_byte(), |dot| dot.start_byte())
                } else {
                    at.start_byte()
                };
                context.report_fixed("SameNameButDifferent", *at, offset, &message, std::slice::from_ref(&fix));
            }
        }
    }
}

fn anonymous_type(part: Node) -> bool {
    crate::engine::source::ancestor(part, &["object_creation_expression", "block", "class_body"]).is_some_and(|holder| {
        holder.kind() == "object_creation_expression"
            && children(holder).iter().any(|child| child.kind() == "class_body")
            && holder.child_by_field_name("type").is_some_and(|kind| kind.start_byte() <= part.start_byte() && part.end_byte() <= kind.end_byte())
    })
}

const DIFFERENT_NAME: &str = "This type is referred to in different ways within this file, which may be confusing.";

pub fn different_name_but_same(context: &Context, node: Node) {
    if node.kind() != "program" {
        return;
    }
    let index = context.resolver.index;
    let mut order: Vec<String> = Vec::new();
    let mut table: std::collections::HashMap<String, Vec<(String, Vec<Node>)>> = std::collections::HashMap::new();
    crate::engine::source::walk(node, |part| {
        let chain = CHAINS.contains(&part.kind());
        if !chain && !matches!(part.kind(), "identifier" | "type_identifier") {
            return;
        }
        let outside = ["import_declaration", "package_declaration", "switch_block_statement_group", "switch_rule"];
        if crate::engine::source::ancestor(part, &outside).is_some() {
            return;
        }
        let Some(holder) = crate::engine::source::parent(part) else { return };
        if CHAINS.contains(&holder.kind()) && (holder.named_child(0) != Some(part) || named_class(context, holder).is_some()) {
            return;
        }
        let referenced = holder.kind() == "method_reference" && holder.named_child(0) == Some(part);
        if part.kind() == "identifier" && !referenced && !super::values::value_name(part) && !matches!(holder.kind(), "annotation" | "marker_annotation") {
            return;
        }
        let inner_creation = holder.kind() == "object_creation_expression"
            && holder.child_by_field_name("type") == Some(part)
            && children(holder).first().is_some_and(|first| first.kind() != "new");
        if inner_creation {
            return;
        }
        let Some((written, class)) = named_class(context, part) else { return };
        if !table.contains_key(&class) {
            order.push(class.clone());
        }
        let row = table.entry(class).or_default();
        let cell = match row.iter().position(|(other, _)| *other == written) {
            Some(at) => at,
            None => {
                row.push((written, Vec::new()));
                row.len() - 1
            }
        };
        for _ in 0..visits(part) * if anonymous_type(part) { 2 } else { 1 } {
            row[cell].1.push(part);
        }
    });
    let own: Vec<String> = children(node)
        .into_iter()
        .filter_map(|declaration| context.resolver.scope.names.get(&declaration.id()).cloned())
        .collect();
    for class in order {
        let row = &table[&class];
        let parts: Vec<&str> = class.split('.').collect();
        let generic = (1..=parts.len()).any(|count| index.get(&parts[..count].join(".")).is_some_and(|info| !info.type_parameters.is_empty()));
        let here = own.iter().any(|top| class == *top || class.starts_with(&format!("{top}.")));
        if generic || here || row.len() < 2 || row.iter().any(|(name, _)| name.starts_with(|first: char| first.is_ascii_lowercase())) {
            continue;
        }
        let mut names: Vec<&str> = row.iter().map(|(name, _)| name.as_str()).collect();
        names.sort_by(|a, b| a.len().cmp(&b.len()).then(a.cmp(b)));
        for name in names {
            let sites: Vec<Node> = row.iter().filter(|(other, _)| other != name).flat_map(|(_, sites)| sites.iter().copied()).collect();
            let first = name.split('.').next().unwrap_or(name);
            let mut meanings: Vec<String> = Vec::new();
            let visible = sites.iter().all(|site| {
                if context.resolver.is_variable(*site, first) {
                    return false;
                }
                match context.resolver.class_name(*site, first) {
                    Some(found) => {
                        if !meanings.contains(&found) {
                            meanings.push(found);
                        }
                        true
                    }
                    None => false,
                }
            });
            if !visible || meanings.len() != 1 || BAD_NESTED.contains(&name) {
                continue;
            }
            let fix = sites.iter().fold(Fix::new(), |fix, site| namefixes::rename_site(context, fix, *site, name));
            for at in sites {
                let offset = if CHAINS.contains(&at.kind()) {
                    children(at).into_iter().filter(|part| part.kind() == ".").next_back().map_or(at.start_byte(), |dot| dot.start_byte())
                } else {
                    at.start_byte()
                };
                let message = format!("{DIFFERENT_NAME}{}", super::fixes::sentence(&context.file.text, std::slice::from_ref(&fix)));
                context.report_always("DifferentNameButSame", offset, &message);
            }
            break;
        }
    }
}
