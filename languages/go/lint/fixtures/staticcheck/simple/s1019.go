package simple

func MakeRedundant(count int) []int {
	return make([]int, count, count) // want S1019
}

func MakePlain(count int) []int {
	return make([]int, count)
}
