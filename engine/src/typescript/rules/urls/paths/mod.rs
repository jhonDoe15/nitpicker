//! The file-path URL rules and `path-names.mts`: the modules and calls that produce file system paths.
pub mod compare;
pub mod imports;
mod operands;

pub const PATH_OBJECTS: [&str; 6] = ["path", "nodePath", "posix", "win32", "pathe", "upath"];
pub const PATH_CALLS: [&str; 3] = ["fileURLToPath", "realpathSync", "realpath"];
