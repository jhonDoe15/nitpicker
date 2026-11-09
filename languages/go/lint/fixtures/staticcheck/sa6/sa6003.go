package sa6

func CountRunes(text string) int {
	count := 0
	for _, letter := range []rune(text) { // want SA6003
		count += int(letter)
	}
	return count
}

func CountDirect(text string) int {
	count := 0
	for _, letter := range text {
		count += int(letter)
	}
	return count
}
