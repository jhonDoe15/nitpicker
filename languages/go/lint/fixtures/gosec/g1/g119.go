package g1

import "net/http"

func Forwarding() *http.Client {
	return &http.Client{
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			request.Header = via[len(via)-1].Header.Clone() // want G119
			return nil
		},
	}
}

func Default() *http.Client {
	return &http.Client{}
}
