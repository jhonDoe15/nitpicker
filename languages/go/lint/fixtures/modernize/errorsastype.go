package modernize

import (
	"errors"
	"os"
)

func PathOf(err error) string {
	var pathError *os.PathError
	if errors.As(err, &pathError) { // want errorsastype
		return pathError.Path
	}
	return ""
}

func PathTyped(err error) string {
	if pathError, ok := errors.AsType[*os.PathError](err); ok {
		return pathError.Path
	}
	return ""
}
