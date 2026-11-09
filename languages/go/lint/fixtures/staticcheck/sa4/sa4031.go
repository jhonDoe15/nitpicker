package sa4

func NeverNil(count int) int {
	values := make([]int, count)
	if values == nil { // want SA4031
		return 0
	}
	return len(values)
}

func MaybeNil(values []int) bool {
	return values == nil
}
