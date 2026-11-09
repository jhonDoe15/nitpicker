package modernize

import (
	"slices"
	"sort"
)

func SortNames(names []string) {
	sort.Slice(names, func(i, j int) bool { return names[i] < names[j] }) // want slicessort
}

func SortNamesSlices(names []string) {
	slices.Sort(names)
}
