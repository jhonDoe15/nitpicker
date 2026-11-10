package gosec

func Pointers(values []int) []*int {
	var pointers []*int
	for _, value := range values {
		pointers = append(pointers, &value) // want range-val-address
	}
	return pointers
}

func Largest(values []int) *int {
	var largest *int
	for _, value := range values {
		largest = larger(largest, &value) // want G601
	}
	return largest
}

func Indexed(values []int) *int {
	var largest *int
	for index := range values {
		largest = larger(largest, &values[index])
	}
	return largest
}

func larger(current, candidate *int) *int {
	if current == nil || *candidate > *current {
		return candidate
	}
	return current
}
