//! `no-shadowed-spread-key`: an explicit key and a spread of an object whose type can carry the same key, where
//! the wrong one wins.
use super::spread_facts::{
    includes_undefined, is_intentional_spread, is_options_type, is_parameter_based, is_parameter_value, is_test_support_file, is_text_or_number,
    key_name, reads_from,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::Scope;
use crate::typescript::rules::support::view::Node;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

const RULE: &str = "no-shadowed-spread-key";

fn explicit_first(key: &str) -> String {
    format!(
        "`{key}` is written before a spread whose type can carry `{key}`, so the spread value replaces this one. Write the spread first \
         (`{{ ...data, {key} }}`)."
    )
}

fn default_after(key: &str) -> String {
    format!(
        "`{key}` is set after a spread of caller options whose type allows `{key}`, so the caller value is ignored. Put the default \
         before the spread, or use `options.{key} ?? value`."
    )
}

fn union_parts(scope: &Scope, kind: &Type) -> Vec<Type> {
    if kind.flags & type_flags::UNION == 0 {
        return vec![kind.clone()];
    }
    scope.types.borrow_mut().parts(kind).to_vec()
}

/// `optionalPropertyOf`: the name the spread's type goes by, when it has the key and the key may be `undefined`.
fn optional_property(scope: &Scope, spread: Node, key: &str) -> Option<String> {
    let mut types = scope.types.borrow_mut();
    let kind = types.type_at(spread.start(), spread.end())?;
    let kind = types.non_nullable(&kind)?;
    let property = types.property(&kind, key)?;
    let value = types.symbol_type_at(&property, spread.start(), spread.end())?;
    drop(types);
    if !includes_undefined(&union_parts(scope, &value)) {
        return None;
    }
    let members = union_parts(scope, &kind);
    let mut types = scope.types.borrow_mut();
    let names: Vec<String> = members.iter().map(|member| types.symbol(member).map(|symbol| symbol.name.clone()).unwrap_or_default()).collect();
    let named: Vec<&String> = names.iter().filter(|name| !is_options_type(name)).collect();
    let pool: Vec<&String> = if named.is_empty() { names.iter().collect() } else { named };
    let least = pool.into_iter().min().cloned();
    Some(types.alias_name(&kind).or(least).unwrap_or_default())
}

fn check_pair<'v>(scope: &Scope<'_, '_, 'v>, spread: Node<'v>, property: Node<'v>, key: &str, before: bool) -> Option<String> {
    let (argument, value) = (spread.node("argument")?, property.node("value")?);
    if is_intentional_spread(argument, key) || reads_from(scope, value, argument) {
        return None;
    }
    let wanted = if before {
        is_parameter_value(scope, value)
    } else {
        is_text_or_number(value) && is_parameter_based(scope, argument)
    };
    if !wanted {
        return None;
    }
    let found = optional_property(scope, argument, key)?;
    match before {
        true => Some(explicit_first(key)),
        false => is_options_type(&found).then(|| default_after(key)),
    }
}

fn object_findings<'v>(scope: &Scope<'_, '_, 'v>, object: Node<'v>) -> Vec<(Node<'v>, String)> {
    let properties = object.nodes("properties");
    let mut found = Vec::new();
    for (spread_index, spread) in properties.iter().enumerate().filter(|(_, node)| node.is("SpreadElement")) {
        for (index, property) in properties.iter().enumerate().filter(|(_, node)| node.is("Property")) {
            let Some(key) = key_name(*property) else { continue };
            if let Some(message) = check_pair(scope, *spread, *property, &key, index < spread_index) {
                found.push((*property, message));
            }
        }
    }
    found
}

fn explicit_attribute<'v>(attribute: Node<'v>) -> Option<(Node<'v>, String, Node<'v>)> {
    let name = attribute.node("name").filter(|name| name.is("JSXIdentifier"))?;
    let container = attribute.node("value").filter(|value| value.is("JSXExpressionContainer"))?;
    let expression = container.node("expression").filter(|expression| !expression.is("JSXEmptyExpression"))?;
    Some((attribute, name.name()?.into_owned(), expression))
}

fn element_findings<'v>(scope: &Scope<'_, '_, 'v>, element: Node<'v>) -> Vec<(Node<'v>, String)> {
    let attributes = element.nodes("attributes");
    let mut found = Vec::new();
    for (spread_index, spread) in attributes.iter().enumerate().filter(|(_, node)| node.is("JSXSpreadAttribute")) {
        let Some(argument) = spread.node("argument") else { continue };
        for (attribute, key, expression) in attributes[..spread_index].iter().filter(|node| node.is("JSXAttribute")).filter_map(|node| explicit_attribute(*node)) {
            let hit = is_parameter_value(scope, expression)
                && !is_intentional_spread(argument, &key)
                && !reads_from(scope, expression, argument)
                && optional_property(scope, argument, &key).is_some();
            if hit {
                found.push((attribute, explicit_first(&key)));
            }
        }
    }
    found
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    if is_test_support_file(&context.file.path.replace('\\', "/")) {
        return;
    }
    let scope = Scope { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes() {
        if node.is("ObjectExpression") {
            found.extend(object_findings(&scope, node));
        } else if node.is("JSXOpeningElement") {
            found.extend(element_findings(&scope, node));
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
