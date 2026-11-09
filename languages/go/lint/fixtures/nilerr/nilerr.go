package nilerr

import (
	"os"
)

func Size(name string) (int64, error) {
	info, err := os.Stat(name)
	if err != nil {
		return 0, nil // want nilerr
	}
	return info.Size(), nil
}

func IgnoredSize(name string) (int64, error) {
	info, err := os.Stat(name)
	if err != nil {
		//lint:ignore nilerr ignore comments do nothing
		return 0, nil // want nilerr
	}
	return info.Size(), nil
}

func CheckedSize(name string) (int64, error) {
	info, err := os.Stat(name)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func Info(name string) (os.FileInfo, error) {
	info, err := os.Stat(name)
	if err != nil {
		return nil, nil // want nilerr
	}
	return info, nil
}
