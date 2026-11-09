package simple

func Tail(values []int) []int {
	return values[1:len(values)] // want S1010
}

func TailShort(values []int) []int {
	return values[1:]
}
