package negativecount

import (
	"bytes"
	"strings"
)

func Pad(text string, width int) string {
	return strings.Repeat(" ", width-len(text)) + text // want negative-count
}

func PadLocal(text string, width int) string {
	gap := width - len(text)
	return strings.Repeat(" ", gap) + text // want negative-count
}

func Buffer(prefix, suffix []byte, width int) []byte {
	return bytes.Repeat([]byte{' '}, width-len(prefix)-len(suffix)) // want negative-count
}

func Slots(total, used int) []int {
	return make([]int, 0, total-used) // want negative-count
}

func PadClamped(text string, width int) string {
	return strings.Repeat(" ", max(0, width-len(text))) + text
}

func PadGuarded(text string, width int) string {
	if width > len(text) {
		return strings.Repeat(" ", width-len(text)) + text
	}
	return text
}

func PadChecked(text string, width int) string {
	gap := width - len(text)
	if gap <= 0 {
		return text
	}
	return strings.Repeat(" ", gap) + text
}

func PadInit(text string, width int) string {
	if gap := width - len(text); gap > 0 {
		return strings.Repeat(" ", gap) + text
	}
	return text
}

func Indent(level int) string {
	return strings.Repeat("  ", level-1)
}

func Plain(count int) []int {
	return make([]int, count)
}

func Fixed(width int) string {
	return strings.Repeat(" ", width)
}

func PadElse(name string) string {
	label := "wide"
	if len(name) > 16 {
		label = "narrow"
	} else {
		name += strings.Repeat(" ", 16-len(name))
	}
	return label + name
}

func Remaining(buffer []byte, used int) []byte {
	return make([]byte, len(buffer)-used)
}

func Doubled(text string, start int) []byte {
	if start >= len(text) {
		return nil
	}
	return make([]byte, 2*len(text)-start)
}
