package g3

import "os"

func Shared(path string) error {
	return os.Chmod(path, 0o666) // want G302
}

func Owned(path string) error {
	return os.Chmod(path, 0o600)
}
