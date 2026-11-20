package textsplits

import (
	"fmt"
	"strconv"
	"strings"
)

type pair struct{ left, right string }

func Cache(tenant, name string, seen map[string]bool) bool {
	return seen[tenant+":"+name] // want delimited-lookup-key
}

func Formatted(tenant, name string, seen map[string]int) {
	seen[fmt.Sprintf("%s-%s", tenant, name)]++ // want delimited-lookup-key
}

func Joined(tenant, name string, seen map[string][]string) []string {
	return seen[strings.Join([]string{tenant, name}, "|")] // want delimited-lookup-key stringConcatSimplify
}

func ViaLocal(tenant, name string, seen map[string]bool) {
	key := tenant + "/" + name
	delete(seen, key) // want delimited-lookup-key
}

func Struct(tenant, name string, seen map[pair]bool) bool { return seen[pair{tenant, name}] }

func Numbered(tenant string, number int, seen map[string]bool) bool {
	return seen[tenant+":"+strconv.Itoa(number)]
}

func Identifiers(tenantID, itemID string, seen map[string]bool) bool {
	return seen[tenantID+":"+itemID]
}

func Single(tenant string, seen map[string]bool) bool { return seen[tenant+":items"] }

func Fixed(seen map[string]bool) bool { return seen["a"+":"+"b"] }

func Plain(tenant, name string) string { return tenant + ":" + name }

func Qualified(pkgPath, symName string, seen map[string]bool) bool { return seen[pkgPath+"."+symName] }

func Dotted(tenant, region string, seen map[string]bool) bool {
	return seen[tenant+"."+region] // want delimited-lookup-key
}
