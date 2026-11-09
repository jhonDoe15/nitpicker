package gocritic

type Basket struct{ items []int }

func (basket *Basket) Joined(source []int) {
	basket.items = append(source, 1) // want appendAssign
}

func Extended(first []int) []int {
	first = append(first, 1)
	return first
}

func Pair(values []int) []int {
	values = append(values, 1) // want appendCombine
	values = append(values, 2)
	return values
}

func PairOnce(values []int) []int {
	return append(values, 1, 2)
}

func Repeated(values []int, limit int) []int {
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value > limit {
			result = append(result, values...) // want rangeAppendAll
		}
	}
	return result
}

func Kept(values []int, limit int) []int {
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value > limit {
			result = append(result, value)
		}
	}
	return result
}
