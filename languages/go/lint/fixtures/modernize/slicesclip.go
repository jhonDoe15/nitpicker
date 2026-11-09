package modernize

import "slices"

func Clipped(values []int) []int {
	return values[:len(values):len(values)] // want slicesclip
}

func ClippedFunc(values []int) []int {
	return slices.Clip(values)
}
