package makezero

func Doubled(values []int) []int {
	doubled := make([]int, len(values))
	for _, value := range values {
		doubled = append(doubled, value*2) // want makezero
	}
	return doubled
}

func Tripled(values []int) []int {
	tripled := make([]int, 0, len(values))
	for _, value := range values {
		tripled = append(tripled, value*3)
	}
	return tripled
}

func Quadrupled(values []int) []int {
	quadrupled := make([]int, len(values))
	for _, value := range values {
		quadrupled = append(quadrupled, value*4) // nozero // want makezero
	}
	return quadrupled
}
