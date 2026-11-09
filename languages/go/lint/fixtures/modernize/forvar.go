package modernize

func Copies(values []int, use func(int)) {
	for _, value := range values {
		value := value // want forvar
		use(value)
	}
}

func Direct(values []int, use func(int)) {
	for _, value := range values {
		use(value)
	}
}
