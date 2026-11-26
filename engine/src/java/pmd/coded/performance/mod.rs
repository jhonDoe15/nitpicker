//! Ports of PMD's performance and security rules written in Java.
mod appends;
pub(super) mod builders;
pub(super) mod fields;
pub(super) mod fold;
mod strings;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "UseIndexOfCharRule" => strings::use_index_of_char,
        "StringInstantiationRule" => strings::string_instantiation,
        "AddEmptyStringRule" => strings::add_empty_string,
        "AppendCharacterWithCharRule" => strings::append_character_with_char,
        "UselessStringValueOfRule" => strings::useless_string_value_of,
        "RedundantFieldInitializerRule" => fields::redundant_field_initializer,
        "HardCodedCryptoKeyRule" => fields::hard_coded_crypto_key,
        "InsecureCryptoIvRule" => fields::insecure_crypto_iv,
        "InefficientStringBufferingRule" => builders::inefficient_string_buffering,
        "InefficientEmptyStringCheckRule" => builders::inefficient_empty_string_check,
        "BigIntegerInstantiationRule" => builders::big_integer_instantiation,
        "UseStringBufferForStringAppendsRule" => appends::use_string_buffer_for_string_appends,
        "ConsecutiveAppendsShouldReuseRule" => appends::consecutive_appends_should_reuse,
        _ => return None,
    })
}
