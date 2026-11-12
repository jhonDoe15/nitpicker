package g7

import (
	"net/http"
	"net/url"
)

func Fetch(request *http.Request) (*http.Response, error) {
	return http.Get(request.URL.Query().Get("url")) // want G704 http-without-timeout
}

func FetchKnown(request *http.Request) (*http.Response, error) {
	target := url.URL{Scheme: "https", Host: "api.example.com", Path: "/items/" + url.PathEscape(request.URL.Query().Get("id"))}
	outgoing, err := http.NewRequestWithContext(request.Context(), http.MethodGet, target.String(), http.NoBody)
	if err != nil {
		return nil, err
	}
	return http.DefaultClient.Do(outgoing) // want http-without-timeout
}
