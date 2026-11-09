package sa4

import "math"

func CeilInt(count int) float64 {
	return math.Ceil(float64(count)) // want SA4015
}

func CeilHalf(count int) float64 {
	return math.Ceil(float64(count) / 2)
}
