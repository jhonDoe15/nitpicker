package simple

func CopyLoop(target, source []int) {
	for index := range source { // want S1001
		target[index] = source[index]
	}
}

func CopyBuiltin(target, source []int) {
	copy(target, source)
}
