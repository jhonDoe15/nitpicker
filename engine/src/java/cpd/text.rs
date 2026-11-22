//! The text CPD reads, as PMD prepares it: the byte order mark dropped, every line ending turned into `\n`,
//! Unicode escapes translated, and the positions of the translated text mapped back to lines and columns of the
//! file the way PMD maps them (columns count UTF-16 units; the mapping remembers the piece it last looked at).

/// The file as PMD reads it: no byte order mark, `\r\n` and `\r` turned into `\n`.
pub fn normalized(text: &str) -> Vec<u16> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut out = Vec::with_capacity(text.len());
    let mut units = text.encode_utf16().peekable();
    while let Some(unit) = units.next() {
        if unit == u16::from(b'\r') {
            if units.peek() == Some(&u16::from(b'\n')) {
                units.next();
            }
            out.push(u16::from(b'\n'));
        } else {
            out.push(unit);
        }
    }
    out
}

struct Piece {
    in_start: usize,
    in_len: usize,
    out_start: usize,
    out_len: usize,
}

/// The translated text and how its offsets lead back into the file.
pub struct Translated {
    pub text: Vec<u16>,
    pieces: Vec<Piece>,
    last: usize,
}

const BACKSLASH: u16 = b'\\' as u16;
const U: u16 = b'u' as u16;

fn hex(unit: u16) -> Option<u16> {
    char::from_u32(u32::from(unit)).and_then(|c| c.to_digit(16)).map(|digit| digit as u16)
}

/// Translates `\uXXXX` escapes as PMD's `JavaEscapeTranslator` does: an odd run of backslashes followed by `u`
/// starts an escape at the run's first backslash. The first piece is there even when it is empty, as in PMD.
/// `None` when an escape is malformed (PMD then skips the file).
pub fn translated(input: &[u16]) -> Option<Translated> {
    let mut text = Vec::with_capacity(input.len());
    let mut pieces: Vec<Piece> = Vec::new();
    let mut copied = 0;
    let mut at = 0;
    while let Some(found) = input[at..].iter().position(|&unit| unit == BACKSLASH) {
        let first = at + found;
        let mut off = first;
        while off < input.len() && input[off] == BACKSLASH {
            off += 1;
        }
        if (off - first) % 2 == 0 || off >= input.len() || input[off] != U {
            at = off;
            continue;
        }
        while off < input.len() && input[off] == U {
            off += 1;
        }
        let digits = input.get(off..off + 4)?;
        let value = digits.iter().try_fold(0u16, |value, &unit| hex(unit).map(|digit| value << 4 | digit))?;
        if pieces.is_empty() || first > copied {
            push(&mut pieces, &mut text, copied, &input[copied..first]);
        }
        pieces.push(Piece { in_start: first, in_len: off + 4 - first, out_start: text.len(), out_len: 1 });
        text.push(value);
        copied = off + 4;
        at = copied;
    }
    if pieces.is_empty() {
        return Some(Translated { text: input.to_vec(), pieces, last: 0 });
    }
    if copied < input.len() {
        push(&mut pieces, &mut text, copied, &input[copied..]);
    }
    Some(Translated { text, pieces, last: 0 })
}

fn push(pieces: &mut Vec<Piece>, text: &mut Vec<u16>, start: usize, units: &[u16]) {
    pieces.push(Piece { in_start: start, in_len: units.len(), out_start: text.len(), out_len: units.len() });
    text.extend_from_slice(units);
}

impl Translated {
    /// PMD's `FragmentedTextDocument.localOffsetTransform`, including the remembered piece.
    pub fn to_input(&mut self, offset: usize, inclusive: bool) -> usize {
        if self.pieces.is_empty() {
            return offset;
        }
        let pieces = &self.pieces;
        let end = |at: usize| pieces[at].out_start + pieces[at].out_len;
        let mut at = self.last;
        let contains = pieces[at].out_start <= offset && offset < end(at);
        if !contains {
            if end(at) < offset {
                while at + 1 < pieces.len() && end(at) < offset {
                    at += 1;
                }
            } else {
                while at > 0 && offset <= pieces[at].out_start {
                    at -= 1;
                }
            }
            self.last = at;
        }
        if inclusive && end(at) == offset && at + 1 < pieces.len() {
            at += 1;
            while at + 1 < pieces.len() && pieces[at].out_len == 0 {
                at += 1;
            }
        }
        pieces[at].in_start + offset - pieces[at].out_start
    }
}

/// Line starts of the file text, PMD's `SourceCodePositioner`.
pub struct Lines {
    starts: Vec<usize>,
}

impl Lines {
    pub fn new(text: &[u16]) -> Lines {
        let mut starts = vec![0];
        starts.extend(text.iter().enumerate().filter(|&(_, &unit)| unit == u16::from(b'\n')).map(|(at, _)| at + 1));
        starts.push(text.len());
        Lines { starts }
    }

    fn line_of(&self, offset: usize) -> usize {
        let searched = &self.starts[..self.starts.len() - 1];
        match searched.binary_search(&offset) {
            Ok(at) => at + 1,
            Err(at) => at,
        }
    }

    /// Line and column (both from 1) of an offset; an end offset at the start of a line belongs to the line before.
    pub fn position(&self, offset: usize, inclusive: bool) -> (u32, u32) {
        let line = self.line_of(offset);
        let index = line - 1;
        if index != 0 && offset == self.starts[index] && !inclusive {
            let last_column = 1 + self.starts[index] - self.starts[index - 1];
            return (index as u32, last_column as u32);
        }
        (line as u32, (1 + offset - self.starts[index]) as u32)
    }
}
