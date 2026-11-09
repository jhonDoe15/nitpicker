package passes

//go:fix inline
func Double(value int) int {
	return value * 2
}

func Quadruple(value int) int {
	return Double(value) * 2 // want inline
}

func Sextuple(value int) int {
	return value * 2 * 3
}
