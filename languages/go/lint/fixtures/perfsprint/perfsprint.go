package perfsprint

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
)

var ErrMissing = fmt.Errorf("missing") // want error-format

var ErrAbsent = errors.New("absent")

func Count(total int) string {
	return fmt.Sprintf("%d", total) // want integer-format
}

func Total(total int) string {
	return strconv.Itoa(total)
}

func Greeting(name string) string {
	return fmt.Sprintf("hello %s", name) // want string-format
}

func Welcome(name string) string {
	return "welcome " + name
}

func Flag(enabled bool) string {
	return fmt.Sprintf("%t", enabled) // want bool-format
}

func Switch(enabled bool) string {
	return strconv.FormatBool(enabled)
}

func Digest(sum []byte) string {
	return fmt.Sprintf("%x", sum) // want hex-format
}

func Hash(sum []byte) string {
	return hex.EncodeToString(sum)
}
