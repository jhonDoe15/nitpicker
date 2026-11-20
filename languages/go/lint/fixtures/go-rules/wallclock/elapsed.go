package wallclock

import (
	"errors"
	"time"
)

func Wait(done func() bool, timeout int64) error {
	startSec := time.Now().Unix() // want wall-clock-elapsed
	for !done() {
		if time.Now().Unix()-startSec > timeout {
			return errors.New("timeout")
		}
	}
	return nil
}

type Histogram interface{ Observe(seconds float64) }

func Measure(work func(), metric Histogram) {
	startNano := time.Now().UnixNano() // want wall-clock-elapsed
	work()
	metric.Observe(float64(time.Now().UnixNano()-startNano) / 1e9)
}

func WaitMonotonic(done func() bool, timeout time.Duration) error {
	start := time.Now()
	for !done() {
		if time.Since(start) > timeout {
			return errors.New("timeout")
		}
	}
	return nil
}

func Stored(work func(), save func(int64), limit int64) bool {
	startSec := time.Now().Unix()
	save(startSec)
	work()
	return time.Now().Unix()-startSec > limit
}

func Age(createdAt, limit int64) bool {
	return time.Now().Unix()-createdAt > limit
}

func Logged(work func(), log func(int64)) {
	startSec := time.Now().Unix()
	work()
	log(time.Now().Unix() - startSec)
}
