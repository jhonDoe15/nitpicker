package simple

import (
	"slices"
	"sort"
)

func SortInterface(values []int) {
	sort.Sort(sort.IntSlice(values)) // want S1032
}

func SortSlices(values []int) {
	slices.Sort(values)
}
