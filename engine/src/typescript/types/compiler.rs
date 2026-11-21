//! Which compiler binaries the engine may talk to. The API server is not a stable interface: the node table
//! layout and the numbers in `tables.rs` belong to one compiler version, so only listed versions are used.
use super::tables::GENERATED_FROM;
use std::path::Path;
use std::process::Command;

/// Compiler versions whose API server the engine was checked against.
pub const SUPPORTED: &[&str] = &[GENERATED_FROM];

/// The version a compiler binary reports, when it is one the engine supports.
pub fn supported_version(executable: &Path) -> Result<String, String> {
    let output = Command::new(executable)
        .arg("--version")
        .output()
        .map_err(|error| format!("cannot start the TypeScript compiler {}: {error}", executable.display()))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let version = version_in(&text).ok_or_else(|| format!("{} did not report a version", executable.display()))?;
    if SUPPORTED.contains(&version) {
        Ok(version.to_string())
    } else {
        Err(format!("TypeScript {version} is not supported by this engine (supported: {})", SUPPORTED.join(", ")))
    }
}

fn version_in(text: &str) -> Option<&str> {
    text.lines().find_map(|line| line.trim().strip_prefix("Version ")).map(str::trim)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_version_line() {
        assert_eq!(version_in("Version 7.0.2\n"), Some("7.0.2"));
        assert_eq!(version_in("tsc: error"), None);
    }

    #[test]
    fn a_missing_binary_is_reported_not_fatal() {
        let error = supported_version(Path::new("/nonexistent/tsc")).unwrap_err();
        assert!(error.starts_with("cannot start the TypeScript compiler"));
    }
}
