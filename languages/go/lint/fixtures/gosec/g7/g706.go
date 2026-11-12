package g7

import (
	"log"
	"log/slog"
	"net/http"
)

func Logged(request *http.Request) {
	log.Printf("user %s logged in", request.URL.Query().Get("user")) // want G706
}

func Structured(request *http.Request) {
	slog.InfoContext(request.Context(), "user logged in", slog.String("user", request.URL.Query().Get("user")))
}
