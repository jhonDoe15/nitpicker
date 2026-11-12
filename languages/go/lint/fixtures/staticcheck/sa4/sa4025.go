package sa4

func Ratio() float64 {
	return 2 / 3 * 10.0 // want SA4025
}

func Fraction() float64 {
	return 2.0 / 3 * 10.0
}
