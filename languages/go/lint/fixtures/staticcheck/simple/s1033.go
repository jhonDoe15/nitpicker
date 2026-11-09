package simple

func DeleteGuarded(values map[string]int, key string) {
	if _, ok := values[key]; ok { // want S1033
		delete(values, key)
	}
}

func Delete(values map[string]int, key string) {
	delete(values, key)
}
