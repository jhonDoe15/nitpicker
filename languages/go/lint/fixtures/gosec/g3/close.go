package g3

import (
	"errors"
	"io"
)

func closeWith(err error, closer io.Closer) error {
	return errors.Join(err, closer.Close())
}
