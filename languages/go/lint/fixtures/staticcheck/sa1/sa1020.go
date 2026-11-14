package sa1

import (
	"net/http"
	"time"
)

func ServeBroken(handler http.Handler) error {
	return http.ListenAndServe("localhost:8080/", handler) // want SA1020 G114
}

func ServeValid(handler http.Handler) error {
	server := &http.Server{Addr: "localhost:8080", Handler: handler, ReadHeaderTimeout: time.Second}
	return server.ListenAndServe()
}
