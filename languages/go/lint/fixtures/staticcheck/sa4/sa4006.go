package sa4

import "strconv"

func Overwritten(text string) int {
	value, err := strconv.Atoi(text) // want SA4006
	value, err = strconv.Atoi(text + "0")
	if err != nil {
		return 0
	}
	return value
}

func Checked(text string) int {
	value, err := strconv.Atoi(text)
	if err != nil {
		return 0
	}
	return value
}
