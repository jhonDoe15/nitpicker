package g7

import (
	"net/http"
	"os/exec"
	"slices"
)

func Command(request *http.Request) *exec.Cmd {
	return exec.CommandContext(request.Context(), request.URL.Query().Get("tool")) // want G702
}

func Listed(request *http.Request) *exec.Cmd {
	if slices.Contains([]string{"date", "uptime"}, request.URL.Query().Get("tool")) {
		return exec.CommandContext(request.Context(), "uptime")
	}
	return nil
}
