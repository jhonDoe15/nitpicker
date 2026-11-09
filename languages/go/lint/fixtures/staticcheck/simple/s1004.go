package simple

import "bytes"

func SameCompare(left, right []byte) bool {
	return bytes.Compare(left, right) == 0 // want S1004
}

func SameEqual(left, right []byte) bool {
	return bytes.Equal(left, right)
}
