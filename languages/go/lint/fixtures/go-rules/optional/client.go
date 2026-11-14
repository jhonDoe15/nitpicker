// Package optional holds fixtures for the go-rules unused-option rule.
package optional

import "time"

type Options struct {
	Retries int
	Timeout time.Duration // want unused-option
	Label   string        `json:"label"`
}

type RegionOpts struct {
	Region string // want unused-option
}

type Client struct {
	name    string
	retries int
	timeout time.Duration
	region  string
}

func Open(name string, options Options) *Client {
	return &Client{name: name + options.Label, retries: options.Retries, timeout: options.Timeout}
}

func (client *Client) Move(options RegionOpts) {
	client.region = options.Region
}

type Option func(*Client)

func WithRetries(retries int) Option {
	return func(client *Client) { client.retries = retries }
}

func WithTimeout(timeout time.Duration) Option { // want unused-option
	return func(client *Client) { client.timeout = timeout }
}

func New(name string, options ...Option) *Client {
	client := &Client{name: name}
	for _, option := range options {
		option(client)
	}
	return client
}

func (client *Client) String() string {
	return client.name + client.region
}
