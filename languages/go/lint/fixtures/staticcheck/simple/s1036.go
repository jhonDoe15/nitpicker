package simple

func CountGuarded(counts map[string]int, key string) {
	if _, ok := counts[key]; ok { // want S1036
		counts[key]++
	} else {
		counts[key] = 1
	}
}

func Count(counts map[string]int, key string) {
	counts[key]++
}
