//! Byte offsets of the engine's tree as the compiler counts places: in UTF-16 units, a byte order mark at the
//! start of the file not counted.

pub struct Utf16 {
    /// UTF-16 offset at each byte offset that starts a character; empty when every byte is one unit.
    units: Vec<u32>,
    mark: u32,
}

impl Utf16 {
    pub fn of(text: &str) -> Utf16 {
        let mark = u32::from(text.starts_with('\u{feff}'));
        if text.is_ascii() {
            return Utf16 { units: Vec::new(), mark };
        }
        let mut units = vec![0; text.len() + 1];
        let mut counted = 0;
        for (offset, character) in text.char_indices() {
            units[offset] = counted;
            counted += character.len_utf16() as u32;
        }
        units[text.len()] = counted;
        Utf16 { units, mark }
    }

    pub fn at(&self, offset: u32) -> u32 {
        let counted = if self.units.is_empty() { offset } else { self.units[offset as usize] };
        counted.saturating_sub(self.mark)
    }
}

#[cfg(test)]
mod tests {
    use super::Utf16;

    #[test]
    fn counts_astral_characters_as_two_units_and_skips_the_mark() {
        let text = "\u{feff}a😀b";
        let offsets = Utf16::of(text);
        assert_eq!(offsets.at(3), 0);
        assert_eq!(offsets.at(4), 1);
        assert_eq!(offsets.at(8), 3);
    }

    #[test]
    fn keeps_ascii_offsets() {
        assert_eq!(Utf16::of("let a = 1;").at(4), 4);
    }
}
