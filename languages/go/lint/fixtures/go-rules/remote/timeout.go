package remote

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

func Status(url string) (status int, err error) {
	response, err := http.Get(url) // want http-without-timeout
	if err != nil {
		return 0, fmt.Errorf("get %s: %w", url, err)
	}
	defer func() { err = errors.Join(err, response.Body.Close()) }()
	return response.StatusCode, nil
}

func Send(request *http.Request) (*http.Response, error) {
	return http.DefaultClient.Do(request) // want http-without-timeout
}

func NewClient() *http.Client {
	return &http.Client{} // want http-without-timeout
}

func NewTimedClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Second}
}

func NewTunedClient(timeout time.Duration) *http.Client {
	client := &http.Client{}
	client.Timeout = timeout
	return client
}

func Fetch(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("request %s: %w", url, err)
	}
	return client.Do(request)
}

type Service struct {
	client *http.Client
}

func NewService(timeout time.Duration) *Service {
	service := &Service{}
	service.client = &http.Client{}
	service.client.Timeout = timeout
	return service
}

func UseDefaults(timeout time.Duration) bool {
	http.DefaultClient.Timeout = timeout
	return http.DefaultClient != nil
}

func NewUnboundedClients() (*http.Client, *http.Client, http.Client) {
	unbounded := &http.Client{Timeout: 0} // want http-without-timeout
	fresh := new(http.Client)             // want http-without-timeout
	var zero http.Client                  // want http-without-timeout
	return unbounded, fresh, zero
}
