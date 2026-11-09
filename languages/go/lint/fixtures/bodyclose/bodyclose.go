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
