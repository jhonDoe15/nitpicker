package noctx

import (
	"context"
	"net/http"
	"os/exec"
)

func Version() *exec.Cmd {
	return exec.Command("go", "version") // want noctx
}

func VersionWithContext(ctx context.Context) *exec.Cmd {
	return exec.CommandContext(ctx, "go", "version")
}

func Request(url string) (*http.Request, error) {
	return http.NewRequest(http.MethodGet, url, http.NoBody) // want noctx
}

func RequestWithContext(ctx context.Context, url string) (*http.Request, error) {
	return http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
}
