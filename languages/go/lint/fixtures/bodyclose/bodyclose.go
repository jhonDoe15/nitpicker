package bodyclose

import (
	"context"
	"errors"
	"net/http"
)

func Status(ctx context.Context, client *http.Client, url string) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return 0, err
	}
	response, err := client.Do(request) // want bodyclose
	if err != nil {
		return 0, err
	}
	return response.StatusCode, nil
}

func ClosedStatus(ctx context.Context, client *http.Client, url string) (status int, err error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return 0, err
	}
	response, err := client.Do(request)
	if err != nil {
		return 0, err
	}
	defer func() { err = errors.Join(err, response.Body.Close()) }()
	return response.StatusCode, nil
}

// Fetch gets the URL and leaves the body to its caller.
// want-below handled
//bodyclose:handled
func Fetch(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, err
	}
	return client.Do(request)
}

func FetchStatus(ctx context.Context, client *http.Client, url string) (int, error) {
	response, err := Fetch(ctx, client, url)
	if err != nil {
		return 0, err
	}
	return response.StatusCode, nil
}
