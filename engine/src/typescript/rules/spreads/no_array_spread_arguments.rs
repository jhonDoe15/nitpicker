//! `no-array-spread-arguments`: a list of unknown length spread into `push`, `unshift`, `splice`, `Math.max`,
//! `Math.min` or `String.fromCharCode` passes each item as an argument and overflows the call stack.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::type_flags;
use regex::Regex;
use std::cell::RefCell;
use std::sync::LazyLock;

const RULE: &str = "no-array-spread-arguments";
const MESSAGE: &str = "Spreading a list into `push`, `unshift`, `splice`, `Math.max`, `Math.min` or `String.fromCharCode` passes each item as an argument, and the call throws `RangeError: Maximum call stack size exceeded` once the list reaches about 125,000 items. Append with a loop (`for (const item of items) target.push(item)`), use `concat`, or compare item by item for a largest or smallest value. An exception fits only when the list is always short.";
const LIST_METHODS: [&str; 3] = ["push", "unshift", "splice"];
const VARIADIC_FUNCTIONS: [&str; 4] = ["Math.max", "Math.min", "String.fromCharCode", "String.fromCodePoint"];

static LIST_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:Readonly)?(?:Map|Set)$|Array$").expect("pattern"));

struct Facts<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    types: &'c RefCell<Types>,
}

const TYPE_DECLARATIONS: [&str; 2] = ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"];

fn declares_type(statement: Node, name: &str) -> bool {
    let declaration = if statement.is("ExportNamedDeclaration") { statement.node("declaration") } else { Some(statement) };
    declaration.is_some_and(|declaration| {
        TYPE_DECLARATIONS.contains(&declaration.kind())
            && declaration.node("id").and_then(|id| id.name()).is_some_and(|found| found == name)
    })
}

fn declares_type_named(identifier: Node) -> bool {
    let Some(name) = identifier.name() else { return false };
    identifier.ancestors().any(|scope| {
        matches!(scope.kind(), "Program" | "BlockStatement" | "TSModuleBlock" | "StaticBlock")
            && scope.nodes("body").into_iter().any(|statement| declares_type(statement, &name))
    })
}

impl Facts<'_, '_, '_> {
    fn is_rest_parameter(&self, node: Node) -> bool {
        if !node.is("Identifier") {
            return false;
        }
        if node.name().as_deref() == Some("arguments") {
            return true;
        }
        let Some(symbol) = self.scopes.variable_named(node) else { return false };
        let definition = self.scopes.defs(symbol).into_iter().next();
        definition.is_some_and(|definition| definition.kind == DefKind::Parameter && definition.name.parent().is_some_and(|parent| parent.is("RestElement")))
    }

    fn member_name(&self, callee: Node) -> Option<String> {
        let object = callee.node("object")?;
        let property = callee.node("property")?;
        if callee.flag("computed") || !property.is("Identifier") {
            return None;
        }
        let property = property.name()?;
        if !object.is("Identifier") {
            return Some(format!(".{property}"));
        }
        let local = self.scopes.variable_named(object).is_some() || declares_type_named(object);
        Some(if local { format!(".{property}") } else { format!("{}.{property}", object.name()?) })
    }

    fn is_list_sink(&self, callee: Node) -> bool {
        let Some(object) = callee.node("object").filter(|object| callee.is("MemberExpression") && !object.is("Super")) else { return false };
        let Some(name) = self.member_name(callee) else { return false };
        if VARIADIC_FUNCTIONS.contains(&name.as_str()) {
            return true;
        }
        let method = name.rsplit('.').next().unwrap_or_default();
        LIST_METHODS.contains(&method) && self.is_array(object)
    }

    fn is_array(&self, node: Node) -> bool {
        let mut types = self.types.borrow_mut();
        let Some(members) = types.non_nullable_members(node.start(), node.end()) else {
            types.refuse("no type for a spread target");
            return false;
        };
        members.iter().all(|member| types.is_array_type(member) || types.is_tuple_type(member))
    }

    fn is_list(&self, node: Node) -> bool {
        let mut types = self.types.borrow_mut();
        let Some(members) = types.non_nullable_members(node.start(), node.end()) else {
            types.refuse("no type for a spread target");
            return false;
        };
        members.iter().any(|member| {
            let member = types.base_constraint(member).unwrap_or_else(|| member.clone());
            if types.is_tuple_type(&member) {
                return false;
            }
            member.flags & type_flags::ANY != 0
                || types.is_array_type(&member)
                || types.symbol(&member).is_some_and(|symbol| LIST_NAME.is_match(&symbol.name))
        })
    }

    fn is_sink_argument(&self, spread: Node) -> bool {
        let Some(call) = spread.parent().filter(|parent| parent.is("CallExpression")) else { return false };
        call.nodes("arguments").contains(&spread) && call.node("callee").is_some_and(|callee| self.is_list_sink(callee))
    }

    fn may_be_long(&self, value: Node) -> bool {
        let short = match value.kind() {
            "ConditionalExpression" => {
                value.node("consequent").is_some_and(|node| node.is("ArrayExpression"))
                    && value.node("alternate").is_some_and(|node| node.is("ArrayExpression"))
            }
            "ArrayExpression" | "Literal" | "TemplateLiteral" => true,
            _ => false,
        };
        !short && !self.is_rest_parameter(value) && self.is_list(value)
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let facts = Facts { scopes, types };
    let mut found = Vec::new();
    for spread in view.nodes().filter(|node| node.is("SpreadElement")) {
        let hit = spread.node("argument").is_some_and(|argument| facts.is_sink_argument(spread) && facts.may_be_long(argument));
        if types.borrow().refused.is_some() {
            return;
        }
        if hit {
            found.push((spread.start(), spread.end()));
        }
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
