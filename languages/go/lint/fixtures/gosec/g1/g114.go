package g1

import (
	"net/http"
	"time"
)

func Serve(handler http.Handler) error {
	return http.ListenAndServe("127.0.0.1:8080", handler) // want G114
}

func ServeBounded(handler http.Handler) error {
	server := &http.Server{Addr: "127.0.0.1:8080", Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	return server.ListenAndServe()
}
