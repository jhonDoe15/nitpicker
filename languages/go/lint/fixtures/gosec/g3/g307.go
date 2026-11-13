package g3

import "os"

func Created(path string) (*os.File, error) {
	return os.Create(path) // want G307
}

func Opened(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o600)
}
