package g3

import (
	"archive/zip"
	"os"
	"path/filepath"
)

func Extracted(target string, file *zip.File) error {
	return os.MkdirAll(filepath.Join(target, file.Name), 0o750) // want G305
}

func Contained(root *os.Root, file *zip.File) error {
	return root.MkdirAll(file.Name, 0o750)
}
