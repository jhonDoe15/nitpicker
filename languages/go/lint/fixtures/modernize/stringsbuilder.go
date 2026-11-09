package modernize

import "strings"

func Concat(words []string) string {
	text := ""
	for _, word := range words {
		text += word // want stringsbuilder
	}
	return text
}

func ConcatBuilder(words []string) string {
	var builder strings.Builder
	for _, word := range words {
		builder.WriteString(word)
	}
	return builder.String()
}
