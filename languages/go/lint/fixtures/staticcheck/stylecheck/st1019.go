package stylecheck

import (
	"fmt" // want ST1019
	format "fmt"
)

func Twice() string {
	return fmt.Sprint(1) + format.Sprint(2)
}
