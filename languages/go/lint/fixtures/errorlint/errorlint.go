package errorlint

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
)

func Done(err error) bool {
	return err == io.EOF // want errorlint
}

func DoneWrapped(err error) bool {
	return errors.Is(err, io.EOF)
}

func Path(err error) string {
	if problem, ok := err.(*fs.PathError); ok { // want errorlint
		return problem.Path
	}
	return ""
}

func PathWrapped(err error) string {
	if problem, ok := errors.AsType[*fs.PathError](err); ok {
		return problem.Path
	}
	return ""
}

func Wrap(err error) error {
	return fmt.Errorf("read config: %v", err) // want errorlint
}

func WrapWithCause(err error) error {
	return fmt.Errorf("read config: %w", err)
}
