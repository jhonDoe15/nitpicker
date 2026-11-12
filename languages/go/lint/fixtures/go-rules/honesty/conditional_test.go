package honesty

import (
	"errors"
	"testing"
)

func TestGuardedAssertion(t *testing.T) {
	order := Find([]Order{{Lines: []int{1}}}, 1)
	if order != nil {
		if len(order.Lines) != 1 {
			t.Errorf("lines = %d", len(order.Lines)) // want conditional-assertion-in-test
		}
	}
}

func TestCheckedFirst(t *testing.T) {
	order := Find([]Order{{Lines: []int{1}}}, 1)
	if order == nil {
		t.Fatal("no order")
	}
	if len(order.Lines) != 1 {
		t.Errorf("lines = %d", len(order.Lines))
	}
}

func TestWantError(t *testing.T) {
	cases := []struct {
		name    string
		order   Order
		wantErr bool
	}{
		{name: "empty", wantErr: true},
		{name: "one", order: Order{Lines: []int{1}}},
	}
	for _, each := range cases {
		t.Run(each.name, func(t *testing.T) {
			_, err := Total(each.order)
			if each.wantErr {
				if !errors.Is(err, errEmpty) {
					t.Fatalf("err = %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestTypeSwitch(t *testing.T) {
	var value any = Order{}
	switch order := value.(type) {
	case Order:
		if len(order.Lines) != 0 {
			t.Error("not empty") // want conditional-assertion-in-test
		}
	case *Order:
	}
}

func TestTypeSwitchWithDefault(t *testing.T) {
	var value any = Order{}
	switch order := value.(type) {
	case Order:
		if len(order.Lines) != 0 {
			t.Error("not empty")
		}
	default:
		t.Fatalf("unexpected %T", order)
	}
}

func TestChecks(t *testing.T) {
	total, err := Total(Order{Lines: []int{5}})
	switch {
	case err != nil:
		t.Fatal(err)
	case total < 0:
		t.Error("negative")
	case total > 10:
		t.Error("too big")
	}
}
