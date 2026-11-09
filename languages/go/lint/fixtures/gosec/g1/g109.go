package g1

import "strconv"

func Narrowed(text string) (int32, error) {
	value, err := strconv.Atoi(text)
	return int32(value), err // want G109 G115
}

func Parsed(text string) (int32, error) {
	value, err := strconv.ParseInt(text, 10, 32)
	return int32(value), err
}
