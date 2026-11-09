package concurrency

import (
	"sync"
	"time"
)

func Warm(load func()) {
	go load()                          // want unowned-goroutine
	time.Sleep(100 * time.Millisecond) // want sleep-to-wait
}

func WarmAll(loads []func()) {
	var group sync.WaitGroup
	for _, load := range loads {
		group.Go(load)
	}
	time.Sleep(time.Second) // want sleep-to-wait
	group.Wait()
}

func WarmAndWait(loads []func()) {
	var group sync.WaitGroup
	for _, load := range loads {
		group.Go(load)
	}
	group.Wait()
}

func Retry(attempts int, run func() error) error {
	var err error
	for range attempts {
		if err = run(); err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return err
}

func WarmOrPause(background bool, load func()) {
	if background {
		go load() // want unowned-goroutine
	} else {
		time.Sleep(time.Second)
	}
}

type Batch struct {
	sync.WaitGroup
}

func (batch *Batch) Warm(load func()) {
	batch.Go(load)
	time.Sleep(time.Second) // want sleep-to-wait
	batch.Wait()
}
