package httpvalues

import (
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

const (
	contentType = "Content-Type"
	jsonType    = "application/json"
)

var mimeTypes = map[string]string{".png": "image/png", ".jpg": "image/jpeg"}

var sizes = map[string]int{".png": 1}

func IsJSON(r *http.Request) bool {
	return r.Header.Get(contentType) == jsonType // want http-value-case
}

func IsForm(r *http.Request) bool {
	kind := r.Header.Get(contentType)
	return strings.HasPrefix(kind, "multipart/") // want http-value-case
}

func Secure(r *http.Request) bool {
	return r.Header.Get("X-Forwarded-Proto") != "https" // want http-value-case
}

func Kind(r *http.Request) string {
	switch r.Header.Get("Accept") { // want http-value-case
	case "text/html":
		return "page"
	case "text/plain":
		return "text"
	}
	return "data"
}

func Local(u *url.URL) bool {
	return u.Host == "example.com" // want http-value-case
}

func HostCookie(name string) bool {
	return strings.HasPrefix(name, "__Host-") // want http-value-case
}

func Mime(file string) string {
	ext := filepath.Ext(file)
	return mimeTypes[ext] // want http-value-case
}

func ByIndex(r *http.Request) []string {
	return r.Header["content-type"] // want http-value-case SA1008
}

func Accepted(r *http.Request) []string {
	return strings.Split(r.Header.Get("Accept"), ",") // want hand-split-http-header
}

func Charset(r *http.Request) string {
	parts := strings.Split(r.Header.Get(contentType), ";") // want hand-split-http-header
	return parts[1]
}

func IsJSONFolded(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get(contentType), jsonType)
}

func IsJSONLowered(r *http.Request) bool {
	return strings.ToLower(r.Header.Get(contentType)) == jsonType
}

func IsJSONParsed(r *http.Request) bool {
	kind, _, err := mime.ParseMediaType(r.Header.Get(contentType))
	return err == nil && kind == jsonType
}

func HasType(r *http.Request) bool {
	return r.Header.Get(contentType) == ""
}

func Requested(r *http.Request) bool {
	return r.Header.Get("X-Requested-With") == "XMLHttpRequest"
}

func Secured(u *url.URL) bool {
	return u.Scheme == "https"
}

func SchemeCapitals(u *url.URL) bool {
	return u.Scheme == "HTTPS" // want http-value-case
}

func HostnameCase(u *url.URL) bool {
	return u.Hostname() == "example.com" // want http-value-case
}

func Method(r *http.Request) bool {
	return r.Method == http.MethodGet
}

func HostCookieFolded(name string) bool {
	return strings.HasPrefix(strings.ToLower(name), "__host-")
}

func MimeLowered(file string) string {
	return mimeTypes[strings.ToLower(filepath.Ext(file))]
}

func Size(file string) int {
	return sizes[filepath.Ext(file)]
}

func Canonical(r *http.Request) []string {
	return r.Header[contentType]
}

func ForwardedFor(r *http.Request) []string {
	return strings.Split(r.Header.Get("X-Forwarded-For"), ",")
}

func Words(text string) []string {
	return strings.Split(text, ",")
}
