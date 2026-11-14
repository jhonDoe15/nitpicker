package g7

import (
	safe "html/template"
	"net/http"
	"text/template"
)

func Rendered(writer http.ResponseWriter, request *http.Request) error {
	page, err := template.New("page").Parse(request.URL.Query().Get("template")) // want G708
	if err != nil {
		return err
	}
	return page.Execute(writer, nil)
}

var greeting = safe.Must(safe.New("page").Parse("Hello {{.}}"))

func RenderedFixed(writer http.ResponseWriter, request *http.Request) error {
	return greeting.Execute(writer, request.URL.Query().Get("name"))
}
