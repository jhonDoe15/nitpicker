//! The URI javac gives a source file, which `@RestrictedApi(allowedOnPath)` is matched against: `Path.toUri()` of the
//! absolute path, then `URI.normalize()`. Observed on JDK 21 for the file objects javac makes from file names.
use std::path::Path;

/// The bytes `Path.toUri()` leaves as they are on Unix: letters, digits, `-_.!~*'()`, `:@&=+$,`, `;` and `/`.
fn kept(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"-_.!~*'():@&=+$,;/".contains(&byte)
}

/// The path with `.` segments dropped and each `..` taking the segment before it away, as `URI.normalize()` does for
/// an absolute path; a `..` at the root stays. `None` when no segment goes, where `URI.normalize()` keeps the URI.
fn normalized(path: &str) -> Option<String> {
    let segments: Vec<&str> = path.split('/').skip(1).collect();
    if !segments.iter().any(|segment| *segment == "." || *segment == "..") {
        return None;
    }
    let mut kept: Vec<&str> = Vec::new();
    let last = segments.len().saturating_sub(1);
    let mut trailing = false;
    let mut removed = false;
    for (at, segment) in segments.iter().enumerate() {
        match *segment {
            "." => {
                trailing = at == last;
                removed = true;
            }
            ".." if kept.last().is_some_and(|before| *before != "..") => {
                kept.pop();
                removed = true;
                trailing = at == last;
            }
            other => {
                kept.push(other);
                trailing = false;
            }
        }
    }
    if !removed {
        return None;
    }
    Some(format!("/{}{}", kept.join("/"), if trailing && !kept.is_empty() { "/" } else { "" }))
}

/// The URI of a source file: `file://` and the encoded absolute path, or `file:` and the normalized path when the
/// path has `.` or `..` segments. A path with no parent folders is taken from the current folder.
pub fn file_uri(path: &Path) -> Option<String> {
    let absolute = if path.is_absolute() { path.to_path_buf() } else { std::env::current_dir().ok()?.join(path) };
    let text = absolute.to_str()?;
    let mut joined = String::with_capacity(text.len());
    let mut slash = false;
    for character in text.chars() {
        if character == '/' && slash {
            continue;
        }
        slash = character == '/';
        joined.push(character);
    }
    if joined.len() > 1 && joined.ends_with('/') {
        joined.pop();
    }
    let mut encoded = String::with_capacity(joined.len());
    for byte in joined.bytes() {
        if kept(byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    Some(match normalized(&encoded) {
        Some(path) => format!("file:{path}"),
        None => format!("file://{encoded}"),
    })
}

#[cfg(test)]
mod tests {
    use super::file_uri;
    use std::path::Path;

    #[test]
    fn uris_are_the_ones_javac_gives() {
        let uri = |path: &str| file_uri(Path::new(path)).expect("uri");
        assert_eq!(uri("/home/u/d ir/sub/A.java"), "file:///home/u/d%20ir/sub/A.java");
        assert_eq!(uri("/home/u/x+y;z/B.java"), "file:///home/u/x+y;z/B.java");
        assert_eq!(uri("/home/u/é/C.java"), "file:///home/u/%C3%A9/C.java");
        assert_eq!(uri("/home/u//p/./A%20b[c]{d}#e?f.java"), "file:/home/u/p/A%2520b%5Bc%5D%7Bd%7D%23e%3Ff.java");
        assert_eq!(uri("/home/u/q`~!@$^&*()=,'\"|<>.java"), "file:///home/u/q%60~!@$%5E&*()=,'%22%7C%3C%3E.java");
        assert_eq!(uri("/home/u/p/../p/A.java"), "file:/home/u/p/A.java");
        assert_eq!(uri("/home/u/p/a:b.java"), "file:///home/u/p/a:b.java");
        assert_eq!(uri("/tmp/../../x.java"), "file:/../x.java");
        assert_eq!(uri("/../home/u/A.java"), "file:///../home/u/A.java");
    }
}
