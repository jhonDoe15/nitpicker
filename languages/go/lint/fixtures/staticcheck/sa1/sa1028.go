package sa1

import (
	"slices"
	"sort"
)

func SortArray(values *[]int) {
	sort.Slice(values, func(i, j int) bool { return (*values)[i] < (*values)[j] }) // want SA1028
}

func SortSlice(values []int) {
	slices.Sort(values)
}
