package stylecheck

import "errors"

var ErrCapital = errors.New("Something failed.") // want ST1005

var ErrLower = errors.New("something failed")
