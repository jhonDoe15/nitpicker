package sa9

import "os"

func RemoveHome() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	return os.RemoveAll(home) // want SA9007
}

func RemoveCache(path string) error {
	return os.RemoveAll(path)
}
