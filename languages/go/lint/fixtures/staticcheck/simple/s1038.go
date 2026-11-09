package simple

import "fmt"

func PrintNested(count int) {
	fmt.Print(fmt.Sprintf("%d\n", count)) // want S1038
}

func PrintFormatted(count int) {
	fmt.Printf("%d\n", count)
}
