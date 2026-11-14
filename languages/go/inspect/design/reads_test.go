package design

import (
	"reflect"
	"testing"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/reads"
)

const account = `package ledger

type Account struct {
	Status string
	Tier   int
	Name   string
}

func (a *Account) Active() bool {
	if a.Status == "open" {
		return a.Tier > 1
	}
	return false
}
`

const consumers = `package app

import "example.com/shop/ledger"

func Limit(a *ledger.Account) int {
	if a.Status == "open" && a.Tier > 2 {
		return len(a.Name)
	}
	return 0
}

func Pick(a ledger.Account) string {
	switch a.Status {
	case "open":
		return a.Name
	}
	return ""
}

func Own(a *ledger.Account) bool { return a.Active() }
`

func readsOf(t *testing.T, id string) []reads.Read {
	t.Helper()
	facts := factsOf(t, map[string]string{"ledger/account.go": account, "app/limit.go": consumers})
	return callableNamed(t, facts, id).Reads
}

func TestListsTheFieldsAFunctionReadsFromAStructAndWhichOnesDecide(t *testing.T) {
	owner := "ledger/account.go#Account"
	cases := map[string][]reads.Read{
		"app/limit.go#Limit": {
			{Type: owner, Fields: []string{"Name", "Status", "Tier"}, Decided: []string{"Status", "Tier"}, Line: 6},
		},
		"app/limit.go#Pick": {
			{Type: owner, Fields: []string{"Name", "Status"}, Decided: []string{"Status"}, Line: 13},
		},
	}
	for id, want := range cases {
		if got := readsOf(t, id); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %s, want %s", id, dump(got), dump(want))
		}
	}
}

func TestIgnoresMethodCallsAndTheReceiversOwnFields(t *testing.T) {
	for _, id := range []string{"app/limit.go#Own", "ledger/account.go#Account.Active"} {
		if got := readsOf(t, id); len(got) != 0 {
			t.Errorf("%s: %s", id, dump(got))
		}
	}
}
