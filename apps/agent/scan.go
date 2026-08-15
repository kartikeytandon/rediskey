package main

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

func sampleKeyspace(ctx context.Context, rdb *redis.Client, limit int) (*KeyspaceSample, error) {
	if limit <= 0 {
		limit = 400
	}
	out := &KeyspaceSample{
		Namespaces: []NamespaceCount{},
		BigKeys:    []BigKeySample{},
	}
	ns := map[string]int{}
	type sized struct {
		key   string
		bytes int64
	}
	var sizes []sized

	deadline := time.Now().Add(2500 * time.Millisecond)
	var cursor uint64
	for out.Sampled < limit && time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			break
		}
		keys, next, err := rdb.Scan(ctx, cursor, "*", 32).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			if out.Sampled >= limit {
				break
			}
			out.Sampled++
			ttl, err := rdb.TTL(ctx, key).Result()
			if err == nil {
				if ttl < 0 {
					out.WithoutTTL++
				} else {
					out.WithTTL++
				}
			}
			prefix := namespaceOf(key)
			ns[prefix]++
			n, err := rdb.Do(ctx, "MEMORY", "USAGE", key).Int64()
			if err == nil {
				sizes = append(sizes, sized{key: key, bytes: n})
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
		time.Sleep(8 * time.Millisecond)
	}

	sort.Slice(sizes, func(i, j int) bool { return sizes[i].bytes > sizes[j].bytes })
	if len(sizes) > 8 {
		sizes = sizes[:8]
	}
	for _, s := range sizes {
		out.BigKeys = append(out.BigKeys, BigKeySample{Key: s.key, Bytes: s.bytes})
	}

	type kv struct {
		p string
		n int
	}
	var list []kv
	for p, n := range ns {
		list = append(list, kv{p, n})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].n > list[j].n })
	if len(list) > 12 {
		list = list[:12]
	}
	for _, x := range list {
		out.Namespaces = append(out.Namespaces, NamespaceCount{Prefix: x.p, Count: x.n})
	}
	if out.Sampled > 0 {
		out.MissingTTLPct = 100 * float64(out.WithoutTTL) / float64(out.Sampled)
	}
	return out, nil
}

func namespaceOf(key string) string {
	if i := strings.IndexByte(key, ':'); i > 0 {
		return key[:i]
	}
	if i := strings.IndexByte(key, '.'); i > 0 {
		return key[:i]
	}
	return "(none)"
}
