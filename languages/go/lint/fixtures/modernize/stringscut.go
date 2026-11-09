package modernize

import "strings"

func PairKey(pair string) string {
	index := strings.Index(pair, "=") // want stringscut
	if index < 0 {
		return pair
	}
	return pair[:index]
}

func PairKeyCut(pair string) string {
	key, _, _ := strings.Cut(pair, "=")
	return key
}
