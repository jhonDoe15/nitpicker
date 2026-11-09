package sa6

import "io"

func WriteBytes(out io.Writer, data []byte) error {
	_, err := io.WriteString(out, string(data)) // want SA6006
	return err
}

func WriteDirect(out io.Writer, data []byte) error {
	_, err := out.Write(data)
	return err
}
