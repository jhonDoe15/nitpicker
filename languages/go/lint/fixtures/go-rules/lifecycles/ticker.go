package lifecycles

import "time"

type Poller struct {
	ticker *time.Ticker
	done   chan struct{}
}

func NewPoller() *Poller {
	return &Poller{ticker: time.NewTicker(time.Second), done: make(chan struct{})}
}

func (p *Poller) Run() {
	for {
		select {
		case <-p.ticker.C:
		case <-p.done:
			return
		}
	}
}

type Beacon struct {
	ticker *time.Ticker
}

func NewBeacon() *Beacon {
	return &Beacon{ticker: time.NewTicker(time.Second)} // want ticker-not-stopped
}

func (b *Beacon) Wait() {
	<-b.ticker.C
}

func (p *Poller) Close() {
	p.ticker.Stop()
	close(p.done)
}

func Drain(out chan<- time.Time) {
	ticker := time.NewTicker(time.Second) // want ticker-not-stopped
	for now := range ticker.C {
		out <- now
	}
}

func Pace(out chan<- time.Time) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for now := range ticker.C {
		out <- now
	}
}

type Handed struct {
	ticker *time.Ticker
}

func NewHanded() *Handed {
	handed := &Handed{}
	ticker := time.NewTicker(time.Second)
	handed.ticker = ticker
	go work(ticker)
	return handed
}

func work(ticker *time.Ticker) {
	defer ticker.Stop()
	<-ticker.C
}

func Later(out chan<- time.Time) {
	ticker := time.NewTicker(time.Second)
	stop := ticker.Stop
	defer stop()
	out <- <-ticker.C
}

func Mirror(out chan<- time.Time) {
	ticker := time.NewTicker(time.Second)
	same := ticker
	defer same.Stop()
	out <- <-ticker.C
}
