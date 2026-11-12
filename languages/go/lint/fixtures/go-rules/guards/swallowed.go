package guards

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
)

const defaultPort = 8080

func Port(text string) int {
	port, err := strconv.Atoi(text)
	if err != nil { // want swallowed-error
		log.Printf("bad port %q: %v", text, err)
		return 0
	}
	return port
}

func Exists(name string) bool {
	_, err := os.Stat(name)
	if err != nil { // want swallowed-error
		return false
	}
	return true
}

func Sizes(names []string) []int64 {
	sizes := []int64{}
	for _, name := range names {
		info, err := os.Stat(name)
		if err != nil { // want swallowed-error
			continue
		}
		sizes = append(sizes, info.Size())
	}
	return sizes
}

func Remove(name string) {
	if err := os.Remove(name); err != nil { // want swallowed-error
		fmt.Fprintln(os.Stderr, err)
		return
	}
	log.Print("removed")
}

func PortOrDefault(text string) int {
	port, err := strconv.Atoi(text)
	if err != nil {
		return defaultPort
	}
	return port
}

func Missing(name string) bool {
	_, err := os.Stat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return true
	}
	log.Print("checked")
	return false
}

func RetriedPort(text string) int {
	port, err := strconv.Atoi(text)
	if err != nil {
		log.Printf("bad port %q: %v", text, err)
		port = PortOrDefault(text)
	}
	return port
}

func Serve(writer http.ResponseWriter, request *http.Request) {
	port, err := strconv.Atoi(request.URL.Query().Get("port"))
	if err != nil {
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}
	writer.WriteHeader(port)
}

func Load(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", name, err)
	}
	return data, nil
}
