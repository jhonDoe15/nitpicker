package g1

import (
	"net/http"
	"time"
)

func Slow(handler http.Handler) *http.Server {
	return &http.Server{Addr: "127.0.0.1:8080", Handler: handler} // want G112
}

func Bounded(handler http.Handler) *http.Server {
	return &http.Server{Addr: "127.0.0.1:8080", Handler: handler, ReadHeaderTimeout: 5 * time.Second}
}
