package sa6

import "sync"

var buffers = sync.Pool{New: func() any { return new([]byte) }}

func PutValue(buffer []byte) {
	buffers.Put(buffer) // want SA6002
}

func PutPointer(buffer *[]byte) {
	buffers.Put(buffer)
}
