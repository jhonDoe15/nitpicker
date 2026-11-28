//! The tree kinds of operators and literals.
use tree_sitter::Node;

pub fn binary_kind(operator: &str) -> &'static str {
    match operator {
        "+" => "PLUS",
        "-" => "MINUS",
        "*" => "MULTIPLY",
        "/" => "DIVIDE",
        "%" => "REMAINDER",
        "<<" => "LEFT_SHIFT",
        ">>" => "RIGHT_SHIFT",
        ">>>" => "UNSIGNED_RIGHT_SHIFT",
        "<" => "LESS_THAN",
        ">" => "GREATER_THAN",
        "<=" => "LESS_THAN_EQUAL",
        ">=" => "GREATER_THAN_EQUAL",
        "==" => "EQUAL_TO",
        "!=" => "NOT_EQUAL_TO",
        "&" => "AND",
        "^" => "XOR",
        "|" => "OR",
        "&&" => "CONDITIONAL_AND",
        _ => "CONDITIONAL_OR",
    }
}

pub fn assignment_kind(operator: &str) -> &'static str {
    match operator {
        "=" => "ASSIGNMENT",
        "+=" => "PLUS_ASSIGNMENT",
        "-=" => "MINUS_ASSIGNMENT",
        "*=" => "MULTIPLY_ASSIGNMENT",
        "/=" => "DIVIDE_ASSIGNMENT",
        "%=" => "REMAINDER_ASSIGNMENT",
        "<<=" => "LEFT_SHIFT_ASSIGNMENT",
        ">>=" => "RIGHT_SHIFT_ASSIGNMENT",
        ">>>=" => "UNSIGNED_RIGHT_SHIFT_ASSIGNMENT",
        "&=" => "AND_ASSIGNMENT",
        "^=" => "XOR_ASSIGNMENT",
        _ => "OR_ASSIGNMENT",
    }
}

pub fn literal_kind(node: Node, text: &str) -> Option<&'static str> {
    let long = text.ends_with(['l', 'L']);
    Some(match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
            if long { "LONG_LITERAL" } else { "INT_LITERAL" }
        }
        "decimal_floating_point_literal" | "hex_floating_point_literal" => {
            if text.ends_with(['f', 'F']) { "FLOAT_LITERAL" } else { "DOUBLE_LITERAL" }
        }
        "true" | "false" => "BOOLEAN_LITERAL",
        "character_literal" => "CHAR_LITERAL",
        "string_literal" => "STRING_LITERAL",
        "null_literal" => "NULL_LITERAL",
        _ => return None,
    })
}
