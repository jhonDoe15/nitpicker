package compilerdirectives

//go:noinlined // want gocheckcompilerdirectives
func Sum(left, right int) int {
	return left + right
}

//go:noinline
func Product(left, right int) int {
	return left * right
}
