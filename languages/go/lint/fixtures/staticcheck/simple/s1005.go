package simple

func KeysBlank(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key, _ := range values { // want S1005
		keys = append(keys, key)
	}
	return keys
}

func KeysPlain(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}
