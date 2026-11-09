package compilerdirectives

//go:noinlined // want gocheckcompilerdirectives
func Difference(left, right int) int {
	return left - right
}

//go:nosplitt
func Sum(left, right int) int { // want-at 8 gocheckcompilerdirectives
	return left + right
}

//go:noinline
func Product(left, right int) int {
	return left * right
}
