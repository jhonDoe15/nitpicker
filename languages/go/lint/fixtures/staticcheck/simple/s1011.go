package simple

func Join(left, right []int) []int {
	for _, value := range right { // want S1011
		left = append(left, value)
	}
	return left
}

func JoinOnce(left, right []int) []int {
	return append(left, right...)
}
