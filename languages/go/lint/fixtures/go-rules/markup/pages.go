package markup

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strings"
)

func Redirect(path string) string {
	return fmt.Sprintf(`did you mean <a href="%s">%s</a>?`, path, html.EscapeString(path)) // want unescaped-html-value
}

func Image(alt, title string) string {
	return fmt.Sprintf(`<img alt="%s" title="%s">`, alt, title) // want unescaped-html-value
}

func Title(name string) string {
	return "<title>" + name + "</title>" // want unescaped-html-value
}

func Escaped(alt string) string {
	return fmt.Sprintf(`<img alt="%s">`, html.EscapeString(alt))
}

func Counted(count int, label string) string {
	return fmt.Sprintf("<b>%d</b> %s", count, html.EscapeString(label))
}

func Constant() string {
	return "<p>" + "static" + "</p>"
}

func Joined(rows []string) string {
	return "<ul>" + strings.Join(rows, "") + "</ul>"
}

func NotMarkup(name string) string {
	return fmt.Sprintf("if a<b then %s of %s", name, name)
}

func Plain(name string) string {
	return fmt.Sprintf("hello %s of %s", name, name)
}

func Quoted(name string) string {
	return "<a>" + html.EscapeString(name) + "</a>"
}

func Link(target *url.URL) string {
	return "<a href=" + target.String() + ">go</a>"
}

func Page(writer http.ResponseWriter, name string) (int, error) {
	return fmt.Fprintf(writer, "<h1>%s</h1>", name)
}
