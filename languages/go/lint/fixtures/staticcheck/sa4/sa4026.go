package sa4

import "math"

func NegativeZero() float64 {
	return -0.0 // want SA4026
}

func Signed() float64 {
	return math.Copysign(0, -1)
}
