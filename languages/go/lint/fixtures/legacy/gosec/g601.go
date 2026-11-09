package gosec

func Pointers(values []int) []*int {
	var pointers []*int
	for _, value := range values {
		pointers = append(pointers, &value) // want G601
	}
	return pointers
}

func Indexed(values []int) []*int {
	var pointers []*int
	for index := range values {
		pointers = append(pointers, &values[index])
	}
	return pointers
}
