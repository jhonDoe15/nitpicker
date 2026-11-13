package design

import (
	"reflect"
	"testing"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/chain"
)

const store = `package store

type Order struct{ ID string }

func Load(id string, limit int) Order { return Order{ID: id} }

func Save(id string) {}
`

const service = `package orders

import "example.com/shop/store"

type Service struct{ backend *Backend }

type Backend struct{}

func (b *Backend) Fetch(id string, limit int) store.Order { return store.Load(id, limit) }

func Find(id string, limit int) store.Order {
	return store.Load(id, limit)
}

func Swap(id string, limit int) store.Order {
	return store.Load(id, 3)
}

func Reorder(limit int, id string) store.Order {
	return store.Load(id, limit)
}

func Forget(id string) {
	store.Save(id)
}

func (s *Service) Via(id string, limit int) store.Order {
	return s.backend.Fetch(id, limit)
}

func Busy(id string) store.Order {
	store.Save(id)
	return store.Load(id, 1)
}

func Spread(ids ...string) {
	store.Save(ids...)
}

func Constant() {
	store.Save("x")
}
`

func forwardOf(t *testing.T, id string) *chain.Forward {
	t.Helper()
	facts := factsOf(t, map[string]string{"store/store.go": store, "orders/service.go": service})
	return callableNamed(t, facts, id).Forward
}

func TestRecordsACallableWhoseBodyIsOneForwardingCall(t *testing.T) {
	loadID := "store/store.go#Load"
	cases := map[string]*chain.Forward{
		"orders/service.go#Find":        {Target: loadID, Arguments: []int{0, 1}, Returned: true},
		"orders/service.go#Swap":        {Target: loadID, Arguments: []int{0, -1}, Returned: true},
		"orders/service.go#Reorder":     {Target: loadID, Arguments: []int{1, 0}, Returned: true},
		"orders/service.go#Forget":      {Target: "store/store.go#Save", Arguments: []int{0}, Returned: false},
		"orders/service.go#Service.Via": {Target: "orders/service.go#Backend.Fetch", Arguments: []int{0, 1}, Returned: true},
		"orders/service.go#Busy":        nil,
		"orders/service.go#Spread":      nil,
		"orders/service.go#Constant":    nil,
	}
	for id, want := range cases {
		if got := forwardOf(t, id); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %s, want %s", id, dump(got), dump(want))
		}
	}
}
