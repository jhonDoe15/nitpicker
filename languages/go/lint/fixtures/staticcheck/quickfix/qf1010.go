package quickfix

import "fmt"

func PrintBytes(data []byte) string {
	return fmt.Sprint(data) // want QF1010
}

func PrintText(data []byte) string {
	return fmt.Sprint(string(data), len(data))
}
