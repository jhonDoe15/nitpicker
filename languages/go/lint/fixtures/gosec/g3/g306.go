package g3

import "os"

func Readable(path string, data []byte) error {
	return os.WriteFile(path, data, 0o644) // want G306
}

func Private(path string, data []byte) error {
	return os.WriteFile(path, data, 0o600)
}
