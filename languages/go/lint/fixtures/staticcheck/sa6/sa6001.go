package sa6

func LookupCopy(index map[string]int, key []byte) int {
	text := string(key) // want SA6001
	return index[text]
}

func LookupDirect(index map[string]int, key []byte) int {
	return index[string(key)]
}
