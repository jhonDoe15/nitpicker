package sa4

type Counter struct {
	Count int
}

func (counter Counter) Lost() {
	counter.Count++ // want SA4005
}

func (counter *Counter) Kept() {
	counter.Count++
}
