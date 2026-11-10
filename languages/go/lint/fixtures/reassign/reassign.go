package reassign

import (
	"errors"
	"io"
)

var ErrDone = errors.New("done")

func Replace() {
	io.EOF = ErrDone // want reassign
}

func Done(err error) bool {
	return errors.Is(err, ErrDone) || errors.Is(err, io.EOF)
}
