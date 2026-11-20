package replacements

import (
	"regexp"
	"strings"
)

var placeholder = regexp.MustCompile(`\{(\w+)\}`)

func Fill(text, value string) string {
	return placeholder.ReplaceAllString(text, value) // want expanding-replacement
}

func FillBytes(text, value []byte) []byte {
	return placeholder.ReplaceAll(text, value) // want expanding-replacement
}

func FillTitle(page, title string) string {
	return placeholder.ReplaceAllString(page, "<title>"+title+"</title>") // want expanding-replacement
}

func FillConstant(text string) string {
	return placeholder.ReplaceAllString(text, "<$1>")
}

func FillLiteral(text, value string) string {
	return placeholder.ReplaceAllLiteralString(text, value)
}

func FillFunc(text, value string) string {
	return placeholder.ReplaceAllStringFunc(text, func(string) string { return value })
}

func FillEscaped(text, value string) string {
	return placeholder.ReplaceAllString(text, strings.ReplaceAll(value, "$", "$$"))
}

func FillName(text string) string {
	const name = "<${1}>"
	return placeholder.ReplaceAllString(text, name)
}

func Plain(text, value string) string {
	return strings.ReplaceAll(text, "{name}", value)
}

var template = "<$1>"

func FillTemplate(text string) string {
	return placeholder.ReplaceAllString(text, template)
}
