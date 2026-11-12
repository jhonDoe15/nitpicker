package sa4

import (
	"errors"
	"io"
)

type closer interface {
	Close() error
}

func Unreachable(value any) string {
	switch value.(type) {
	case io.Closer:
		return "closer"
	case closer: // want SA4020
		return "never"
	}
	return "other"
}

func Kind(value any) string {
	switch value.(type) {
	case error:
		return errors.New("error").Error()
	case io.Closer:
		return "closer"
	}
	return "other"
}
