package honesty

import (
	"testing"
	"time"
)

func TestEachFound(t *testing.T) {
	orders := []Order{{Lines: []int{1}}, {Lines: []int{2}}}
	for _, order := range orders[1:] {
		if _, err := Total(order); err != nil {
			t.Error(err) // want conditional-assertion-in-test
		}
	}
}

func TestTable(t *testing.T) {
	cases := map[string]Order{"one": {Lines: []int{1}}, "two": {Lines: []int{1, 1}}}
	for name, order := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Total(order); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestTableWithoutSubtests(t *testing.T) {
	cases := []Order{{Lines: []int{1}}}
	for _, order := range cases {
		if _, err := Total(order); err != nil {
			t.Fatal(err) // want conditional-assertion-in-test
		}
	}
}

func TestRetries(t *testing.T) {
	for attempt := 0; attempt < 3; attempt++ { // want rangeint
		if _, err := Total(Order{Lines: []int{attempt + 1}}); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		expectTotal(t, Order{Lines: []int{1}}, 1)
		if _, err := Total(Order{}); err == nil {
			t.Fatal("want an error")
		}
	}
}

func TestHelperLoop(t *testing.T) {
	expectAll(t, Find(nil, 0))
}

func expectAll(t *testing.T, order *Order) {
	t.Helper()
	if order == nil {
		t.Fatal("no order")
	}
	for _, line := range order.Lines {
		if line < 0 {
			t.Errorf("line %d", line) // want conditional-assertion-in-test
		}
	}
}

func TestSleeps(t *testing.T) {
	done := make(chan int)
	go func() { // want unowned-goroutine
		time.Sleep(time.Millisecond)
	}()
	go func() {
		total, err := Total(Order{Lines: []int{1}})
		if err == nil {
			done <- total
		}
	}()
	time.Sleep(10 * time.Millisecond) // want sleep-in-test
	<-time.After(time.Millisecond)    // want sleep-in-test
	time.Sleep(0)
	if total := <-done; total != 1 {
		t.Errorf("total = %d", total)
	}
}
