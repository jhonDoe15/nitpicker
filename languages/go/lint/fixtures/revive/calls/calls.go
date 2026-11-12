package calls

import (
	"os"
	"runtime"
	"sync"
	"time"
)

func Collect() {
	runtime.GC() // want call-to-gc
}

func Stop(code int) {
	os.Exit(code) // want deep-exit
}

func Midnight() time.Time {
	return time.Date(2024, 0, 1, 0, 0, 0, 0, time.UTC) // want time-date
}

func January() time.Time {
	return time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC)
}

func Same(left, right time.Time) bool {
	return left != right // want time-equal
}

func Equal(left, right time.Time) bool {
	return left.Equal(right)
}

func Contains(values map[string]bool, wanted string) bool {
	for key := range values { // want inefficient-map-lookup
		if key == wanted {
			return true
		}
	}
	return false
}

func Has(values map[string]bool, wanted string) bool {
	_, found := values[wanted]
	return found
}

func Raced() (total int) {
	done := make(chan bool)
	go func() {
		total = 1 // want datarace
		done <- true
	}()
	<-done
	return total
}

func Counted() int {
	var wg sync.WaitGroup
	result := 0
	wg.Go(func() {
		defer wg.Done() // want forbidden-call-in-wg-go
		result = 1
	})
	wg.Wait()
	return result
}

func Returned() {
	return
	Collect()
}

func Quit(code int) {
	os.Exit(code) // want deep-exit unreachable-code
	Collect()
}
