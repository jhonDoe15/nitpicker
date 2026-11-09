package gocritic

import (
	"errors"
	"os"
)

func bump(value *int) int {
	*value++
	return *value
}

func Bumped(value int) (int, int) {
	return value, bump(&value) // want evalOrder
}

func BumpedFirst(value int) (int, int) {
	next := bump(&value)
	return value, next
}

func Removed(name string) error {
	var err error
	if err = os.Remove(name); err != nil { // want sloppyReassign
		return err
	}
	return nil
}

func OpenedOnce(name string) (*os.File, error) {
	file, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	return file, nil
}

func Checked(read func() error, other error) error {
	if err := read(); other != nil { // want uncheckedInlineErr
		return err
	}
	if err := read(); err != nil {
		return err
	}
	return errors.Join(other)
}

func Exited(name string, done func()) {
	defer done()
	if name == "" {
		os.Exit(1) // want exitAfterDefer
	}
}

func Returned(name string, done func()) int {
	defer done()
	if name == "" {
		return 1
	}
	return 0
}
