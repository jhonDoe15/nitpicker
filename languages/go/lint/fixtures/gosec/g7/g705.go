package g7

import (
	"fmt"
	"html"
	"net/http"
)

func Greet(writer http.ResponseWriter, request *http.Request) (int, error) {
	return fmt.Fprintf(writer, "<h1>Hello %s</h1>", request.URL.Query().Get("name")) // want G705
}

func GreetEscaped(writer http.ResponseWriter, request *http.Request) (int, error) {
	return fmt.Fprintf(writer, "<h1>Hello %s</h1>", html.EscapeString(request.URL.Query().Get("name")))
}
