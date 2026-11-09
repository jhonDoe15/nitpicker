package sa4

import (
	"slices"
	"sort"
)

func SortLost(values []string) []string {
	values = sort.StringSlice(values) // want SA4029
	return values
}

func SortValues(values []string) {
	slices.Sort(values)
}
