package stylecheck

import "errors"

func ErrorFirst() (error, int) { // want ST1008
	return errors.New("failed"), 0
}

func ErrorLast() (int, error) {
	return 0, errors.New("failed")
}
