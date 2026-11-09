package sa1

import (
	"errors"
	"io"
)

func IsEOFSwapped(err error) bool {
	return errors.Is(io.EOF, err) // want SA1032
}

func IsEOF(err error) bool {
	return errors.Is(err, io.EOF)
}
