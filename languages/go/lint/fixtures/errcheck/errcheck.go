package errcheck

import (
	"errors"
	"os"
)

func Ignored(name string) {
	os.Remove(name) // want errcheck
}

func Blank(name string) {
	_ = os.Remove(name) // want errcheck
}

func Asserted(value any) string { // want any-in-exported-signature
	return value.(string) // want errcheck
}

func Returned(name string) error {
	return os.Remove(name)
}

func Joined(name string) (err error) {
	file, err := os.Open(name)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, file.Close()) }()
	return nil
}

func Checked(value any) (string, bool) { // want any-in-exported-signature
	text, ok := value.(string)
	return text, ok
}
