package passes

import (
	"errors"
	"io"
	"reflect"
)

func SameError(err error) bool {
	return reflect.DeepEqual(err, io.EOF) // want deepequalerrors
}

func IsError(err error) bool {
	return errors.Is(err, io.EOF)
}
