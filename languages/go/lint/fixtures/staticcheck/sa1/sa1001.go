package sa1

import "text/template"

func BrokenTemplate() (*template.Template, error) {
	return template.New("page").Parse("{{.Name}") // want SA1001
}

func ValidTemplate() (*template.Template, error) {
	return template.New("page").Parse("{{.Name}}")
}
