package simple

func Log(lines *[]string, line string) {
	*lines = append(*lines, line)
	return // want S1023
}

func Record(lines *[]string, line string) {
	*lines = append(*lines, line)
}
