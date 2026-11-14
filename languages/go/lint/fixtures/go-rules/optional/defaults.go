package optional

func Default() *Client {
	options := Options{Retries: 3}
	options.Label = "default"
	return Open("primary", options)
}

func Fallback() *Client {
	return New("fallback", WithRetries(1))
}
