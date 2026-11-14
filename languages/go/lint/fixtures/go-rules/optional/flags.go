package optional

import (
	"bytes"
	"encoding/binary"
	"flag"
)

type ServeOptions struct {
	Port  int
	Count int
}

type FileOptions struct {
	Size int64
}

func Serve(options ServeOptions) int {
	return options.Port + options.Count
}

func Read(options FileOptions) int64 {
	return options.Size
}

func Configured(flags *flag.FlagSet, data []byte) (int, int64, error) {
	var serve ServeOptions
	flags.IntVar(&serve.Port, "port", 8080, "port to listen on")
	serve.Count++
	var file FileOptions
	err := binary.Read(bytes.NewReader(data), binary.LittleEndian, &file)
	return Serve(serve), Read(file), err
}
