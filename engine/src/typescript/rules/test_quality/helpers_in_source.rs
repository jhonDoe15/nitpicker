//! `no-test-helpers-in-source`: a file whose folder or name marks it as a test helper, reported on the whole program.
//! The caller gives the file's path relative to the project (`path`), and the `colocated` and `testRoot` options.
use crate::typescript::rules::Context;
use crate::typescript::rules::test_runtime::production_runtime::first_token;

const RULE: &str = "no-test-helpers-in-source";
const TEST_SUPPORT_DIRECTORY: &str = "test-support";
const HELPER_DIRECTORIES: [&str; 8] =
    ["testing", "test-utils", "test-helpers", TEST_SUPPORT_DIRECTORY, "test-fixtures", "fixtures", "__fixtures__", "__mocks__"];
const HELPER_WORDS: [&str; 4] = ["test-utils", "test-helpers", "test-support", "fixtures"];
const EXCEPTION_ROUTE: &str = "An exception fits only when it is real production code.";

/// `path.posix.extname` of a base name.
fn extension(base: &[char]) -> usize {
    let (mut start_dot, mut end, mut pre_dot_state) = (None, None, 0);
    for index in (0..base.len()).rev() {
        if end.is_none() {
            end = Some(index + 1);
        }
        if base[index] == '.' {
            if start_dot.is_none() {
                start_dot = Some(index);
            } else if pre_dot_state != 1 {
                pre_dot_state = 1;
            }
        } else if start_dot.is_some() {
            pre_dot_state = -1;
        }
    }
    let (Some(dot), Some(end)) = (start_dot, end) else { return 0 };
    if pre_dot_state == 0 || (pre_dot_state == 1 && dot == end - 1 && dot == 1) {
        return 0;
    }
    end - dot
}

/// `path.parse(base).name`.
fn stem(base: &str) -> String {
    let characters: Vec<char> = base.chars().collect();
    characters[..characters.len() - extension(&characters)].iter().collect()
}

/// `^(?:.*[-.])?(?:test-utils|test-helpers|test-support|fixtures)$`.
fn is_helper_stem(stem: &str) -> bool {
    HELPER_WORDS.iter().any(|word| {
        let Some(before) = stem.strip_suffix(word) else { return false };
        let breaks = |character: char| matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}');
        before.is_empty() || ((before.ends_with('-') || before.ends_with('.')) && !before.contains(breaks))
    })
}

/// `helperName`.
pub fn helper_name(filename: &str, colocated: bool) -> Option<String> {
    let normalized = filename.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();
    let (base, directories) = parts.split_last()?;
    if colocated && directories.contains(&TEST_SUPPORT_DIRECTORY) {
        return None;
    }
    if let Some(directory) = directories.iter().find(|part| HELPER_DIRECTORIES.contains(part)) {
        return Some(format!("{directory}/"));
    }
    is_helper_stem(&stem(base)).then(|| base.to_string())
}

pub fn check(context: &mut Context) {
    let colocated = context.setting(&format!("{RULE}.colocated")) == Some("true");
    let test_root = context.setting(&format!("{RULE}.test-root")).unwrap_or("test").to_string();
    let path = context.setting(&format!("{RULE}.path")).map_or_else(|| context.display().to_string(), str::to_string);
    let Some(name) = helper_name(&path, colocated) else { return };
    let message = if colocated {
        format!("This looks like a test helper ({name}), but it sits in production source outside a test-support/ folder. Tests in this project sit next to the code, and test-only modules go in a test-support/ folder beside the code they serve: move it there. {EXCEPTION_ROUTE}")
    } else {
        format!("This looks like a test helper ({name}), but it sits in production source, so it is mutation-tested and shipped. Tests in this project live under {test_root}/, so move it to a test-support/ folder there ({test_root}/test-support/). {EXCEPTION_ROUTE}")
    };
    let start = first_token(context.file.text) as u32;
    context.report_range(RULE, start, Some(context.file.text.len() as u32), message);
}
