package honesty

import (
	"os"
	"testing"
)

func TestTotalRuns(t *testing.T) { // want test-without-assertion
	total, err := Total(Order{Lines: []int{1, 2}})
	t.Log(total, err)
}

func TestTotal(t *testing.T) {
	total, err := Total(Order{Lines: []int{1, 2}})
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 {
		t.Errorf("total = %d, want 3", total)
	}
}

func TestTotalByHelper(t *testing.T) {
	expectTotal(t, Order{Lines: []int{4}}, 4)
}

func expectTotal(t *testing.T, order Order, want int) {
	t.Helper()
	got, err := Total(order)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("total = %d, want %d", got, want)
	}
}

func TestSkippedWithoutReason(t *testing.T) {
	if os.Getenv("ORDERS_DB") == "" {
		t.Skip() // want skipped-test-without-reason
	}
	expectTotal(t, Order{Lines: []int{1}}, 1)
}

func TestSkippedForGood(t *testing.T) {
	t.Skip("flaky on CI") // want switched-off-test
	expectTotal(t, Order{Lines: []int{1}}, 1)
}

func TestSkippedForGoodSilently(t *testing.T) {
	t.SkipNow() // want switched-off-test
}

func TestShortOnly(t *testing.T) {
	if testing.Short() {
		t.Skip("needs the orders database")
	}
	expectTotal(t, Order{Lines: []int{2}}, 2)
}

func TestSubtestSwitchedOff(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		t.Skip("not written yet") // want switched-off-test
	})
}
