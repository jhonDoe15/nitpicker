package stylecheck

import "errors"

var NotFound = errors.New("not found") // want ST1012

var ErrNotFound = errors.New("not found")
