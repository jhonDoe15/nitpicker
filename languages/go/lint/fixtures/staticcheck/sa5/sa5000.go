package sa5

func NilMap() map[string]int {
	var counts map[string]int
	counts["a"] = 1 // want SA5000
	return counts
}

func MadeMap() map[string]int {
	counts := map[string]int{}
	counts["a"] = 1
	return counts
}
