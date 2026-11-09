package sa4

func NegativeLength(values []int) bool {
	return len(values) < 0 // want SA4024
}

func Empty(values []int) bool {
	return len(values) == 0
}
