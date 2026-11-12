package failures

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
)

func Parse(text string) int {
	value, err := strconv.Atoi(text)
	if err != nil {
		panic(err) // want panic-for-failure
	}
	return value
}

func ParseOrError(text string) (int, error) {
	value, err := strconv.Atoi(text)
	if err != nil {
		return 0, fmt.Errorf("parse %q: %w", text, err)
	}
	return value, nil
}

func MustPattern(expression string) *regexp.Regexp {
	pattern, err := regexp.Compile(expression)
	if err != nil {
		panic(err)
	}
	return pattern
}

var Handler = func(value int) int {
	if value < 0 {
		panic("negative") // want panic-for-failure
	}
	return value
}

func Guard(run func()) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if failure, ok := recovered.(error); ok {
				err = failure
				return
			}
			panic(recovered)
		}
	}()
	run()
	return errors.New("not reached")
}

func Mustang(text string) int {
	if text == "" {
		panic("empty") // want panic-for-failure
	}
	return len(text)
}

func Direction(sign int) string {
	switch {
	case sign < 0:
		return "down"
	case sign > 0:
		return "up"
	default:
		panic("unreachable: sign is not zero here")
	}
}

func Wrapped(run func()) {
	defer func() {
		var recovered = recover()
		if recovered != nil {
			panic(fmt.Sprintf("wrapped: %v", recovered))
		}
	}()
	run()
}
