package simple

import "fmt"

func Constant() string {
	return fmt.Sprint("ready") // want S1039
}

func Literal() string {
	return "ready"
}
