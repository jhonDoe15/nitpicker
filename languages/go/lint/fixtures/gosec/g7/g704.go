package g7

import (
	"net/http"
	"net/url"
)

func Fetch(request *http.Request) (*http.Response, error) {
	return http.Get(request.URL.Query().Get("url")) // want G704
}

func FetchKnown(request *http.Request) (*http.Response, error) {
	target := url.URL{Scheme: "https", Host: "api.example.com", Path: "/items/" + url.PathEscape(request.URL.Query().Get("id"))}
	return http.Get(target.String())
}
