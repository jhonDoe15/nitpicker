package g1

import (
	"compress/gzip"
	"io"
)

const maxUnpacked = 10 << 20

func Unpack(target io.Writer, source io.Reader) error {
	reader, err := gzip.NewReader(source)
	if err != nil {
		return err
	}
	_, err = io.Copy(target, reader) // want G110
	return err
}

func UnpackLimited(target io.Writer, source io.Reader) error {
	reader, err := gzip.NewReader(source)
	if err != nil {
		return err
	}
	_, err = io.Copy(target, io.LimitReader(reader, maxUnpacked))
	return err
}
