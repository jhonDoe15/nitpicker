package design

import (
	"reflect"
	"testing"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/decide"
)

const payments = `package pay

type Method int

const (
	Card Method = iota
	Paypal
	Invoice
	Cash
)

type Order struct {
	Status string
	Method Method
	Count  int
}
`

const policies = `package app

import "example.com/shop/pay"

func Fee(m pay.Method) int {
	switch m {
	case pay.Card, pay.Paypal:
		return 3
	case pay.Invoice:
		return 1
	default:
		return 0
	}
}

func Online(m pay.Method) bool {
	if m == pay.Card || m == pay.Paypal {
		return true
	}
	return false
}

func Chain(o *pay.Order) string {
	if o.Status == "open" || o.Status == "held" {
		return "a"
	} else if o.Status == "done" {
		return "b"
	} else {
		return "c"
	}
}

func Loose(o *pay.Order) int {
	switch {
	case o.Count == 1 || o.Count == 2:
		return 1
	case o.Count == 3:
		return 2
	}
	return 0
}

func Mixed(o *pay.Order, other string) bool {
	if o.Status == other {
		return true
	}
	switch o.Method {
	case pay.Card, other:
		return true
	}
	return false
}

func ByField(o *pay.Order) int {
	switch o.Count {
	case 1, 2:
		return 1
	}
	return 0
}
`

func decisionsOf(t *testing.T, name string) []decide.Decision {
	t.Helper()
	facts := factsOf(t, map[string]string{"pay/pay.go": payments, "app/policy.go": policies})
	return callableNamed(t, facts, "app/policy.go#"+name).Decisions
}

func TestListsSwitchesAndIfChainsOverAnEnumByTheirArms(t *testing.T) {
	enum := "pay/pay.go#Method"
	cases := map[string][]decide.Decision{
		"Fee":    {{Subject: enum, Groups: [][]string{{"Card", "Paypal"}, {"Invoice"}}, Line: 6, Otherwise: true}},
		"Online": {{Subject: enum, Groups: [][]string{{"Card", "Paypal"}}, Line: 17}},
	}
	for name, want := range cases {
		if got := decisionsOf(t, name); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %s, want %s", name, dump(got), dump(want))
		}
	}
}

func TestListsDecisionsOnAFieldOfAProjectStruct(t *testing.T) {
	status := "pay/pay.go#Order.Status"
	count := "pay/pay.go#Order.Count"
	cases := map[string][]decide.Decision{
		"Chain":   {{Subject: status, Groups: [][]string{{"open", "held"}, {"done"}}, Line: 24, Otherwise: true}},
		"Loose":   {{Subject: count, Groups: [][]string{{"1", "2"}, {"3"}}, Line: 34}},
		"ByField": {{Subject: count, Groups: [][]string{{"1", "2"}}, Line: 55}},
	}
	for name, want := range cases {
		if got := decisionsOf(t, name); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %s, want %s", name, dump(got), dump(want))
		}
	}
}

func TestSkipsDecisionsThatCompareWithAValueThatIsNotAConstant(t *testing.T) {
	if got := decisionsOf(t, "Mixed"); len(got) != 0 {
		t.Fatalf("Mixed %s", dump(got))
	}
}
