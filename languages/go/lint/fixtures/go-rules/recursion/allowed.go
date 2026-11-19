package recursion

import (
	"errors"
	"time"
)

func Sum(root *Node) int {
	total := 0
	pending := []*Node{root}
	for i := 0; i < len(pending); i++ {
		total += pending[i].Value
		pending = append(pending, pending[i].Children...)
	}
	return total
}

func Fetch(get func() error, attempts int) error {
	var failure error
	for attempt := range attempts {
		if failure = get(); failure == nil {
			return nil
		}
		time.Sleep(time.Duration(attempt) * time.Second)
	}
	return errors.Join(failure)
}

func Poll(check func() bool) {
	if !check() {
		time.AfterFunc(time.Second, func() { Poll(check) })
	}
}

func Values(nodes []*Node) []int {
	values := make([]int, 0, len(nodes))
	for _, node := range nodes {
		values = append(values, node.Value)
	}
	return values
}

type Counter struct{ count int }

func (counter *Counter) Add(other *Counter) { counter.count += other.count }

func (counter *Counter) Merge(others []*Counter) {
	for _, other := range others {
		other.Add(counter)
	}
}
