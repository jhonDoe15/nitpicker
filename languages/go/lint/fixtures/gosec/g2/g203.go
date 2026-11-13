package g2

import "html/template"

func Trusted(markup string) template.HTML {
	return template.HTML(markup) // want G203
}

func Escaped(markup string) string {
	return template.HTMLEscapeString(markup)
}
