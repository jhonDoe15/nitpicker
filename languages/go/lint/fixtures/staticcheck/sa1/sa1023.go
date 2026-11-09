package sa1

type Recorder struct {
	Total int
}

func (recorder *Recorder) Write(data []byte) (int, error) {
	data[0] = 0 // want SA1023
	recorder.Total += len(data)
	return len(data), nil
}

type Counter struct {
	Total int
}

func (counter *Counter) Write(data []byte) (int, error) {
	counter.Total += len(data)
	return len(data), nil
}
