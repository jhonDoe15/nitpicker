package g3

import "os"

func OpenFolder(path string) error {
	return os.MkdirAll(path, 0o777) // want G301
}

func PrivateFolder(path string) error {
	return os.MkdirAll(path, 0o750)
}
