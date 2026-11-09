package sa5

import "os"

func CloseEarly(name string) error {
	file, err := os.Open(name)
	defer file.Close() // want SA5001
	if err != nil {
		return err
	}
	return nil
}

func CloseAfterCheck(name string) error {
	file, err := os.Open(name)
	if err != nil {
		return err
	}
	return file.Close()
}
