package revive

func Addresses(values []int) []*int {
	var pointers []*int
	for _, value := range values {
		pointers = append(pointers, &value) // want range-val-address
	}
	return pointers
}

func Copies(values []int) []*int {
	var pointers []*int
	for index := range values {
		pointers = append(pointers, &values[index])
	}
	return pointers
}
