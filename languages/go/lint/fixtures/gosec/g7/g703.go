package g7

import (
	"net/http"
	"os"
)

func Read(request *http.Request) ([]byte, error) {
	return os.ReadFile(request.URL.Query().Get("file")) // want G703
}

func ReadRooted(root *os.Root, request *http.Request) ([]byte, error) {
	return root.ReadFile(request.URL.Query().Get("file"))
}
