package stylecheck

import (
	. "strings" // want ST1001
)

func Upper(text string) string {
	return ToUpper(text)
}
