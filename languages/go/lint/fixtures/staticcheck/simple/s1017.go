package simple

import "strings"

func TrimManual(text string) string {
	if strings.HasPrefix(text, "v") { // want S1017
		text = text[len("v"):]
	}
	return text
}

func Trim(text string) string {
	return strings.TrimPrefix(text, "v")
}
