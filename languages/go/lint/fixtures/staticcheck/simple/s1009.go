package simple

func NilAndEmpty(values []int) bool {
	return values == nil || len(values) == 0 // want S1009
}

func Empty(values []int) bool {
	return len(values) == 0
}
