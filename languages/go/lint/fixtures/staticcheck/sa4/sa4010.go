package sa4

func Dropped(count int) int {
	values := make([]int, 0, count)
	values = append(values, 1) // want SA4010
	return count
}

func Returned(values []int) []int {
	return append(values, 1)
}
