package textsplits

import (
	"fmt"
	"unicode/utf8"
)

func Excerpt(text string, limit int) string {
	if len(text) > limit {
		return text[:limit-3] + "..." // want byte-cut-splits-rune
	}
	return text
}

func Title(title string, limit int) string {
	if len(title) <= limit {
		return title
	}
	return title[0:limit] // want byte-cut-splits-rune
}

func Short(text string) string {
	if len(text) > 80 {
		return text[:80] // want byte-cut-splits-rune
	}
	return text
}

func Runes(text string, limit int) string {
	if len(text) > limit {
		return string([]rune(text)[:limit])
	}
	return text
}

func Aware(text string, limit int) string {
	if len(text) > limit {
		for !utf8.RuneStart(text[limit]) {
			limit--
		}
		return text[:limit]
	}
	return text
}

func Hash(hash string, limit int) string {
	if len(hash) > limit {
		return hash[:limit]
	}
	return hash
}

func Unguarded(text string, limit int) string { return text[:limit] }

func Bytes(data []byte, limit int) []byte {
	if len(data) > limit {
		return data[:limit]
	}
	return data
}

func FirstByte(text string) string {
	if len(text) > 1 {
		return text[:1]
	}
	return text
}

func Preview(value string, limit int) string {
	if len(value) > limit {
		return value[:limit-3] + "..." // want byte-cut-splits-rune
	}
	return value
}

func Uncut(value string, limit int) string {
	if len(value) > limit {
		return value[:limit]
	}
	return value
}

func Compared(value string) bool {
	return len(value) > 3 && value[:3] == "GMT"
}

func Complaint(text string, limit int) error {
	if len(text) > limit {
		return fmt.Errorf("bad text %s", text[:limit])
	}
	return nil
}
