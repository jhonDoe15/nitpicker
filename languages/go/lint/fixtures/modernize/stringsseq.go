package modernize

import "strings"

func Count(text string) int {
	total := 0
	for _, word := range strings.Split(text, ",") { // want stringsseq
		total += len(word)
	}
	return total
}

func CountSeq(text string) int {
	total := 0
	for word := range strings.SplitSeq(text, ",") {
		total += len(word)
	}
	return total
}
