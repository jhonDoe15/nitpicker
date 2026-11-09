package simple

import "bytes"

func Text(buffer *bytes.Buffer) string {
	return string(buffer.Bytes()) // want S1030
}

func TextDirect(buffer *bytes.Buffer) string {
	return buffer.String()
}
