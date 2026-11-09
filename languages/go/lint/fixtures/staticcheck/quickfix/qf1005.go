package quickfix

import "math"

func Square(value float64) float64 {
	return math.Pow(value, 2) // want QF1005
}

func SquareProduct(value float64) float64 {
	return value * value
}
