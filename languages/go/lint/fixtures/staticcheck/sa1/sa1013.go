package sa1

import "io"

func SeekSwapped(file io.Seeker) (int64, error) {
	return file.Seek(io.SeekStart, 0) // want SA1013
}

func SeekStart(file io.Seeker) (int64, error) {
	return file.Seek(0, io.SeekStart)
}
