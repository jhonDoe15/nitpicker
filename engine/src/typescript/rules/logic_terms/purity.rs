//! `shared/logic/purity.mts`: which terms read without writing and which cannot throw.
use super::Term;

const OPERATORS: [&str; 20] = ["!", "-", "+", "~", "typeof", "*", "<", "<=", ">", ">=", "==", "!=", "===", "!==", "&", "|", "^", "<<", ">>", ">>>"];
const REPEATABLE: [&str; 5] = ["/", "%", "**", "in", "instanceof"];
const NEVER_THROWING: [&str; 4] = ["!", "typeof", "===", "!=="];
const PURE_NAMESPACES: [&str; 3] = ["Math", "Character", "StrictMath"];
const STRING_READS: [&str; 19] = [
    "charAt", "charCodeAt", "codePointAt", "startsWith", "endsWith", "includes", "indexOf", "lastIndexOf", "isEmpty", "isBlank", "trim",
    "trimStart", "trimEnd", "strip", "toLowerCase", "toUpperCase", "isPresent", "contains", "length",
];

fn is_leaf(node: &Term) -> bool {
    matches!(node.kind, "literal" | "name" | "this")
}

fn pure_static(receiver: &str, method: &str) -> bool {
    let methods: &[&str] = match receiver {
        "Number" => &["isNaN", "isFinite", "isInteger", "isSafeInteger"],
        "Double" => &["isNaN", "isFinite", "isInfinite", "compare"],
        "Float" => &["isNaN", "isFinite", "isInfinite"],
        "Integer" | "Long" | "Boolean" => &["compare"],
        "Objects" => &["isNull", "nonNull", "equals"],
        "Array" => &["isArray"],
        _ => &[],
    };
    methods.contains(&method)
}

fn is_pure_callee(callee: Option<&Term>) -> bool {
    let Some(callee) = callee.filter(|callee| callee.kind == "member") else { return false };
    let method = callee.value().unwrap_or("undefined");
    if let Some(receiver) = callee.children.first().filter(|receiver| receiver.kind == "name") {
        let name = receiver.value().unwrap_or("undefined");
        if PURE_NAMESPACES.contains(&name) {
            return method != "random";
        }
        if pure_static(name, method) {
            return true;
        }
    }
    callee.value().is_some_and(|value| STRING_READS.contains(&value))
}

/// `isSideEffectFree`; with `repeatable`, the operators that only throw or give NaN count as pure too.
pub fn is_side_effect_free(node: &Term, repeatable: bool) -> bool {
    if is_leaf(node) {
        return true;
    }
    let all = || node.children.iter().all(|child| is_side_effect_free(child, repeatable));
    match node.kind {
        "unary" | "binary" => {
            let operator = node.value().unwrap_or_default();
            let known = OPERATORS.contains(&operator) || (repeatable && node.kind == "binary" && REPEATABLE.contains(&operator));
            known && all()
        }
        "logical" | "conditional" | "index" | "abs" | "cast" => all(),
        "member" => node.children.first().is_some_and(|object| is_side_effect_free(object, repeatable)),
        "call" => all() && is_pure_callee(node.children.first()),
        _ => false,
    }
}

pub fn cannot_throw(node: &Term) -> bool {
    if is_leaf(node) {
        return true;
    }
    let all = || node.children.iter().all(cannot_throw);
    match node.kind {
        "unary" | "binary" => node.value().is_some_and(|operator| NEVER_THROWING.contains(&operator)) && all(),
        "logical" | "conditional" => all(),
        _ => false,
    }
}
