//! Line starts as the TypeScript compiler and ESLint count them: `\n`, `\r\n`, `\r`, U+2028 and U+2029 end a line.
pub struct LineTable {
    starts: Vec<u32>,
}

impl LineTable {
    pub fn of(text: &str) -> LineTable {
        let bytes = text.as_bytes();
        let mut starts = vec![0u32];
        let mut index = 0;
        while index < bytes.len() {
            match bytes[index] {
                b'\n' => starts.push(index as u32 + 1),
                b'\r' => {
                    if bytes.get(index + 1) == Some(&b'\n') {
                        index += 1;
                    }
                    starts.push(index as u32 + 1);
                }
                0xE2 if bytes.get(index + 1) == Some(&0x80) && matches!(bytes.get(index + 2), Some(0xA8 | 0xA9)) => {
                    index += 2;
                    starts.push(index as u32 + 1);
                }
                _ => {}
            }
            index += 1;
        }
        LineTable { starts }
    }
    /// 1-based line of a byte offset.
    pub fn line(&self, offset: u32) -> u32 {
        self.starts.partition_point(|start| *start <= offset) as u32
    }
    pub fn count(&self) -> u32 {
        self.starts.len() as u32
    }
    /// 0-based column in UTF-16 units, as ESLint and the compiler report it.
    pub fn column_utf16(&self, text: &str, offset: u32) -> u32 {
        let start = self.starts[self.line(offset) as usize - 1] as usize;
        text[start..offset as usize].encode_utf16().count() as u32
    }
}
