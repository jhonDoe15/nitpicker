package modernize

import "slices"

func Reverse(values []int, use func(int)) {
	for index := len(values) - 1; index >= 0; index-- { // want slicesbackward
		use(values[index])
	}
}

func ReverseIterator(values []int, use func(int)) {
	for _, value := range slices.Backward(values) {
		use(value)
	}
}
