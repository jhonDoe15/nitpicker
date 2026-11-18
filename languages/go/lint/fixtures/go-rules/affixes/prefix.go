package affixes

import (
	"io/fs"
	"path/filepath"
	"strings"
)

func StripBase(pathname, base string) string {
	if strings.HasPrefix(pathname, base) { // want prefix-without-boundary
		return pathname[len(base):]
	}
	return pathname
}

func Inside(pathname, base string) bool {
	return pathname == base || strings.HasPrefix(pathname, base+"/")
}

func InsideChecked(pathname, root string) bool {
	return strings.HasPrefix(pathname, root) && pathname[len(root)] == '/'
}

func SameHost(hostname, domain string) bool {
	return strings.HasSuffix(hostname, domain) // want prefix-without-boundary
}

func SubHost(hostname, domain string) bool {
	return strings.HasSuffix(hostname, "."+domain)
}

func Dotted(hostname, domain string) bool {
	return strings.HasPrefix(domain, ".") && strings.HasSuffix(hostname, domain)
}

func Local(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost") // want prefix-without-boundary
}

func Vendored(path string) bool {
	return strings.Contains(path, "node_modules")
}

func Route(path string) bool {
	return strings.HasPrefix(path, "/api")
}

func Plain(filename, path string) bool {
	return strings.HasPrefix(filename, path)
}

func Bracketed(hostname string) bool {
	return strings.HasPrefix(hostname, "[") && strings.HasSuffix(hostname, "]")
}

func Walked(root string) error {
	return filepath.WalkDir(root, func(path string, _ fs.DirEntry, err error) error {
		if strings.HasPrefix(path, root) {
			return nil
		}
		return err
	})
}
