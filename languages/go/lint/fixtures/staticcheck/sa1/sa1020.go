package sa1

import "net/http"

func ServeBroken(handler http.Handler) error {
	return http.ListenAndServe("localhost:8080/", handler) // want SA1020
}

func ServeValid(handler http.Handler) error {
	return http.ListenAndServe("localhost:8080", handler)
}
