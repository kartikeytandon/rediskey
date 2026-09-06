package main

import (
	"context"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const probeSamples = 25

// collectLatencyP99Us returns command latency p99 in microseconds.
// Prefers Redis 7+ INFO latencystats; falls back to a sampled PING probe.
func collectLatencyP99Us(ctx context.Context, rdb *redis.Client) (float64, string) {
	if p99 := maxP99FromLatencyStats(ctx, rdb); p99 > 0 {
		return p99, "latencystats"
	}
	if p99 := probePingP99Us(ctx, rdb, probeSamples); p99 > 0 {
		return p99, "probe"
	}
	return 0, ""
}

func maxP99FromLatencyStats(ctx context.Context, rdb *redis.Client) float64 {
	raw, err := rdb.Info(ctx, "latencystats").Result()
	if err != nil {
		return 0
	}
	var max float64
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "latency_percentiles_usec_") {
			continue
		}
		_, stats, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		for _, part := range strings.Split(stats, ",") {
			part = strings.TrimSpace(part)
			if !strings.HasPrefix(part, "p99=") {
				continue
			}
			v, err := strconv.ParseFloat(strings.TrimPrefix(part, "p99="), 64)
			if err != nil || v <= 0 {
				continue
			}
			if v > max {
				max = v
			}
		}
	}
	return max
}

func probePingP99Us(ctx context.Context, rdb *redis.Client, n int) float64 {
	if n < 1 {
		return 0
	}
	durs := make([]float64, 0, n)
	for i := 0; i < n; i++ {
		start := time.Now()
		if err := rdb.Ping(ctx).Err(); err != nil {
			return 0
		}
		durs = append(durs, float64(time.Since(start).Microseconds()))
	}
	sort.Float64s(durs)
	idx := int(math.Ceil(0.99*float64(len(durs)))) - 1
	if idx < 0 {
		idx = 0
	}
	return durs[idx]
}
