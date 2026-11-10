const GO_MOD = 'module example.com/shop\n\ngo 1.22\n';

const TALLY = `package shop

type Tally struct{ count int }

func (t *Tally) Bump() { t.count++ }

func (t *Tally) Count() int { return t.count }
`;

const TALLY_TEST = `package shop

import (
	"testing"
	"time"
)

func TestTallyPeer(t *testing.T) {
	t.Parallel()
	t.Log("waiting next to the racing test")
	time.Sleep(20 * time.Millisecond)
}

func TestTally(t *testing.T) {
	t.Parallel()
	t.Log("counting")
	tally := &Tally{}
	done := make(chan struct{})
	go func() {
		tally.Bump()
		close(done)
	}()
	_ = tally.Count()
	<-done
}
`;

export const RACE_BASE_FILES = {
  'go.mod': GO_MOD,
  'nitpicker.config.json': '{ "preset": "go" }\n',
  'shop/tally.go': TALLY,
  'shop/tally_test.go': TALLY_TEST,
};

export const STOCK = `package shop

type Stock struct{ units int }

func (s *Stock) Restock(units int) { s.units += units }

func (s *Stock) Units() int { return s.units }
`;

export const STOCK_TEST = `package shop

import "testing"

func TestStock(t *testing.T) {
	stock := &Stock{}
	done := make(chan struct{})
	go func() {
		stock.Restock(2)
		close(done)
	}()
	if units := stock.Units(); units < 0 {
		t.Fatalf("units %d", units)
	}
	<-done
}
`;

export const LABEL = `package shop

func Label(name string) string {
	return "item " + name
}
`;

export const LABEL_TEST = `package shop

import "testing"

func TestLabel(t *testing.T) {
	if Label("pen") != "item pen" {
		t.Fatal("wrong label")
	}
}
`;
