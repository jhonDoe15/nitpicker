package quickfix

import (
	"fmt"
	"strings"
)

func WriteFormatted(builder *strings.Builder, count int) {
	builder.WriteString(fmt.Sprintf("%d", count)) // want QF1012
}

func Fprint(builder *strings.Builder, count int) error {
	_, err := fmt.Fprintf(builder, "%d", count)
	return err
}
