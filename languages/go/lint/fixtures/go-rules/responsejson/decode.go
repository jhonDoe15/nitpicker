package responsejson

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

type User struct {
	Name string `json:"name"`
}

func open(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, err
	}
	return client.Do(request)
}

func Load(ctx context.Context, client *http.Client, url string) (user User, err error) {
	resp, err := open(ctx, client, url)
	if err != nil {
		return user, err
	}
	defer func() { err = errors.Join(err, resp.Body.Close()) }()
	err = json.NewDecoder(resp.Body).Decode(&user) // want unchecked-response-json
	return user, err
}

func LoadAfter(ctx context.Context, client *http.Client, url string) (user User, err error) {
	resp, err := open(ctx, client, url)
	if err != nil {
		return user, err
	}
	defer func() { err = errors.Join(err, resp.Body.Close()) }()
	err = json.NewDecoder(resp.Body).Decode(&user) // want unchecked-response-json
	if resp.StatusCode != http.StatusOK {
		return user, fmt.Errorf("status %d", resp.StatusCode)
	}
	return user, err
}

func LoadChecked(ctx context.Context, client *http.Client, url string) (user User, err error) {
	resp, err := open(ctx, client, url)
	if err != nil {
		return user, err
	}
	defer func() { err = errors.Join(err, resp.Body.Close()) }()
	if resp.StatusCode != http.StatusOK {
		return user, fmt.Errorf("status %s", resp.Status)
	}
	err = json.NewDecoder(resp.Body).Decode(&user)
	return user, err
}

func reject(resp *http.Response) error {
	if resp.StatusCode >= 400 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

func LoadHelper(ctx context.Context, client *http.Client, url string) (user User, err error) {
	resp, err := open(ctx, client, url)
	if err != nil {
		return user, err
	}
	defer func() { err = errors.Join(err, resp.Body.Close()) }()
	if err := reject(resp); err != nil {
		return user, err
	}
	err = json.NewDecoder(resp.Body).Decode(&user)
	return user, err
}

func Decode(resp *http.Response) (User, error) {
	var user User
	err := json.NewDecoder(resp.Body).Decode(&user)
	return user, err
}

func FromFile(reader http.File) (User, error) {
	var user User
	err := json.NewDecoder(reader).Decode(&user)
	return user, err
}
