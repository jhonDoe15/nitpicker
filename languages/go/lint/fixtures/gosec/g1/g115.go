package g1

import "math"

func Wrapped(value uint32) int32 {
	return int32(value) // want G115
}

func Checked(value uint32) (int32, bool) {
	if value > math.MaxInt32 {
		return 0, false
	}
	return int32(value), true
}
