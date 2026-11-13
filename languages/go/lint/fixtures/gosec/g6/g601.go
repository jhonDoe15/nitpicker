package g6

func Pointers(values []int) []*int {
	var pointers []*int
	for _, value := range values {
		pointers = append(pointers, &value)
	}
	return pointers
}
