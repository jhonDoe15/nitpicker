package sa1

import "strconv"

func ParseBase(text string) (int64, error) {
	return strconv.ParseInt(text, 1, 64) // want SA1030
}

func ParseDecimal(text string) (int64, error) {
	return strconv.ParseInt(text, 10, 64)
}
