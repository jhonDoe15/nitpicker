package g3

import (
	"archive/zip"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func Extracted(target string, file *zip.File) error {
	return os.MkdirAll(filepath.Join(target, file.Name), 0o750) // want G305
}

func Contained(target string, file *zip.File) error {
	path, err := filepath.Rel(target, filepath.Join(target, filepath.Clean(file.Name)))
	if err != nil || strings.HasPrefix(path, "..") {
		return errors.New("archive entry leaves the target folder")
	}
	return os.MkdirAll(filepath.Join(target, path), 0o750)
}
