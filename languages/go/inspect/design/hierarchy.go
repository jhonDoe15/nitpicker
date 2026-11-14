package design

import (
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

type hierarchy struct {
	supertypes map[*index.TypeInfo][]*index.TypeInfo
	implements map[*index.TypeInfo]map[string]bool
}

func newHierarchy(x *index.Index) *hierarchy {
	h := &hierarchy{
		supertypes: map[*index.TypeInfo][]*index.TypeInfo{},
		implements: map[*index.TypeInfo]map[string]bool{},
	}
	var contracts, all []*index.TypeInfo
	for _, file := range x.Files {
		for _, info := range file.Pkg.Order {
			if info.File != file || typeKind(info) == "" {
				continue
			}
			all = append(all, info)
			if info.IsInterface() && len(x.MethodSet(info)) > 0 {
				contracts = append(contracts, info)
			}
		}
	}
	for _, info := range all {
		h.link(x, info, contracts)
	}
	return h
}

func (h *hierarchy) link(x *index.Index, info *index.TypeInfo, contracts []*index.TypeInfo) {
	seen := map[*index.TypeInfo]bool{info: true}
	for _, parent := range info.Embedded() {
		if typeKind(parent) != "" && !seen[parent] {
			seen[parent] = true
			h.supertypes[info] = append(h.supertypes[info], parent)
		}
	}
	methods := x.MethodSet(info)
	for _, contract := range contracts {
		needed := x.MethodSet(contract)
		if seen[contract] || !covers(methods, needed) {
			continue
		}
		seen[contract] = true
		h.supertypes[info] = append(h.supertypes[info], contract)
		if h.implements[info] == nil {
			h.implements[info] = map[string]bool{}
		}
		for name := range needed {
			h.implements[info][name] = true
		}
	}
}

func covers(have, need map[string][2]int) bool {
	for name, arity := range need {
		actual, found := have[name]
		if !found || actual != arity {
			return false
		}
	}
	return true
}
