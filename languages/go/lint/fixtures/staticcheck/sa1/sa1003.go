package sa1

import (
	"encoding/binary"
	"io"
)

func WriteSized(out io.Writer, value int) error {
	return binary.Write(out, binary.LittleEndian, value) // want SA1003
}

func WriteFixed(out io.Writer, value int64) error {
	return binary.Write(out, binary.LittleEndian, value)
}
