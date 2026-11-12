package sa4

func Stuck(values []int) int {
	total := 0
	for index := 0; index < len(values); total++ { // want SA4008
		total += values[index]
	}
	return total
}

func Sum(values []int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}
