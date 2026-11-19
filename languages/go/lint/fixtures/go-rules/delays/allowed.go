package delays

import "time"

const backoff = 2 * time.Second

const tick = 10 * time.Millisecond

type Waiter struct {
	delay time.Duration
}

func NewWaiter() *Waiter {
	return &Waiter{delay: backoff}
}

func (w *Waiter) Wait() {
	time.Sleep(w.delay)
}

func Retry(ready func() bool, delay time.Duration) {
	for !ready() {
		time.Sleep(delay)
	}
}

func RetryWith(ready func() bool, interval int) {
	for attempt := 0; attempt < interval && !ready(); attempt++ {
		time.Sleep(backoff)
	}
}

func Tick() {
	time.Sleep(tick)
}

func Literal() {
	time.Sleep(3 * time.Second)
}

func pause() {
	time.Sleep(backoff)
}

type worker struct{}

func (worker) Run() {
	time.Sleep(backoff)
}

func Hidden() {
	pause()
	worker{}.Run()
}

type RetryOptions struct {
	Attempts int
}

func RetryOpts(ready func() bool, options RetryOptions) int {
	for !ready() {
		time.Sleep(backoff)
	}
	return options.Attempts
}

func RetryOnce(ready func() bool) int {
	return RetryOpts(ready, RetryOptions{Attempts: 1})
}
