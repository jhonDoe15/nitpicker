package simple

func Slide(values []int, offset int) []int {
	count := len(values) - offset
	for index := 0; index < count; index++ { // want S1018
		values[index] = values[offset+index]
	}
	return values[:count]
}

func SlideCopy(values []int, offset int) []int {
	count := copy(values, values[offset:])
	return values[:count]
}
