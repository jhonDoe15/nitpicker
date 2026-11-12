package sa1

import "fmt"

func PrintDynamic(text string) string {
	return fmt.Sprintf(text) // want SA1006
}

func PrintVerb(text string) string {
	return fmt.Sprintf("%q!", text)
}
