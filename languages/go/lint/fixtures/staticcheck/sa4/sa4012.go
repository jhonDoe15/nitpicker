package sa4

import "math"

func IsNaNWrong(value float64) bool {
	return value == math.NaN() // want SA4012
}

func IsNaN(value float64) bool {
	return math.IsNaN(value)
}
