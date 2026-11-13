package g1

import (
	"io/fs"
	"os"
	"path/filepath"
)

func RemoveAll(folder string) error {
	return filepath.WalkDir(folder, func(path string, _ fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return os.Remove(path) // want G122
	})
}

func RemoveRooted(folder string) error {
	root, err := os.OpenRoot(folder)
	if err != nil {
		return err
	}
	return fs.WalkDir(root.FS(), ".", func(path string, _ fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return root.Remove(path)
	})
}
