package sa4

type Counter struct {
	Count int
}

func (counter Counter) Lost() {
	counter.Count++ // want SA4005
}

type Tally struct {
	Count int
}

func (tally *Tally) Kept() {
	tally.Count++
}
