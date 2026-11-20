package preconditions

import (
	"errors"
	"fmt"
)

type Record struct {
	Name  string
	Value *int
}

func Build(name string, value *int) (*Record, error) {
	if value == nil { // want precondition-message-names-other-value
		return nil, errors.New("name must not be nil")
	}
	return &Record{Name: name, Value: value}, nil
}

func Wait(duration *int, timeUnit *string) error {
	if duration == nil { // want precondition-message-names-other-value
		return fmt.Errorf("TimeUnit must not be nil, got %v", timeUnit)
	}
	return nil
}

func Checked(name string, value *int) (*Record, error) {
	if name == "" {
		return nil, errors.New("name must not be empty")
	}
	return &Record{Name: name, Value: value}, nil
}

func Both(path, sock *string) error {
	if path != nil {
		return nil
	}
	if sock == nil {
		return errors.New("path was not specified, and no sock specified")
	}
	return nil
}

func Unrelated(name string, value *int) error {
	if value == nil {
		return errors.New("request must not be nil")
	}
	return errors.New(name)
}

func Derived(constraint *int) error {
	iface := constraint
	if iface == nil {
		return errors.New("constraint is nil")
	}
	return nil
}
