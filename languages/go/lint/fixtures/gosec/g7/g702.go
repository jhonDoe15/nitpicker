package g7

import (
	"net/http"
	"os/exec"
)

var commands = map[string]string{"date": "date", "uptime": "uptime"}

func Command(request *http.Request) *exec.Cmd {
	return exec.CommandContext(request.Context(), request.URL.Query().Get("tool")) // want G702
}

func Listed(request *http.Request) *exec.Cmd {
	name, known := commands[request.URL.Query().Get("tool")]
	if !known {
		return nil
	}
	return exec.CommandContext(request.Context(), name)
}
