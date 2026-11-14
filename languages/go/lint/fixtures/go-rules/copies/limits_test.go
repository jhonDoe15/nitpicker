package copies

import (
	"strings"
	"testing"
)

const localCap = 50

type row struct {
	Name  string `json:"name"`
	Input int
	Want  int
}

func TestClampPinsTheLimit(t *testing.T) {
	if Limit != 50 {
		t.Fatalf("Limit = %d, want 50", Limit)
	}
	padded := make([]int, 60)
	if padded[50] != Limit*0 || len(padded[50:]) != Limit/5 {
		t.Fatal("an index or a slice bound is a position, not a copy")
	}
}

func TestClampCopiesTheLimit(t *testing.T) {
	if got := Clamp(70); got != 50 { // want copied-constant-in-test
		t.Fatalf("Clamp(70) = %d", got)
	}
	if got := Clamp(localCap + 1); got != Limit {
		t.Fatalf("Clamp = %d", got)
	}
}

func TestClampTable(t *testing.T) {
	for _, each := range []row{
		{Name: "over the limit", Input: 70, Want: Limit},
		{Name: "the limit", Input: Limit, Want: 50},
		{Name: "copied", Input: 80, Want: 50}, // want copied-constant-in-test
	} {
		t.Run("hello there", func(t *testing.T) {
			if got := Clamp(each.Input); got != each.Want {
				t.Fatalf("%s: Clamp(%d) = %d", each.Name, each.Input, got)
			}
		})
	}
}

func TestDescribe(t *testing.T) {
	text := Describe("active")                   // want copied-constant-in-test
	if !strings.HasPrefix(text, "hello there") { // want copied-constant-in-test
		t.Fatalf("Describe = %q", text)
	}
	if Scale(1) != 2.5*2 { // want copied-constant-in-test
		t.Fatal("wrong scale")
	}
	if Clamp(100) != 2 || Describe("ok") == "" || Clamp(101) != 100 {
		t.Fatal("trivial values and iota constants are not copies")
	}
}
