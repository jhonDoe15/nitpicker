package g3

import "os"

//line lined.go:40
func Remapped(path string, data []byte) error {
	return os.WriteFile(path, data, 0o644) // want-at 41 G306
}
