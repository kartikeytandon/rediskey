package main

import "time"

type MetricSample struct {
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Timestamp string  `json:"timestamp"`
}

type SlowlogSample struct {
	ID         int64  `json:"id"`
	DurationUs int64  `json:"durationUs"`
	Command    string `json:"command"`
}

type NamespaceCount struct {
	Prefix string `json:"prefix"`
	Count  int    `json:"count"`
}

type BigKeySample struct {
	Key   string `json:"key"`
	Bytes int64  `json:"bytes"`
}

type KeyspaceSample struct {
	Sampled       int              `json:"sampled"`
	WithTTL       int              `json:"withTtl"`
	WithoutTTL    int              `json:"withoutTtl"`
	MissingTTLPct float64          `json:"missingTtlPct"`
	Namespaces    []NamespaceCount `json:"namespaces"`
	BigKeys       []BigKeySample   `json:"bigKeys"`
	ScanTruncated bool             `json:"scanTruncated,omitempty"`
	ScanComplete  bool             `json:"scanComplete,omitempty"`
	ScanReason    string           `json:"scanReason,omitempty"`
}

type CommandPicture struct {
	TopCommands   []CommandStatSample  `json:"topCommands"`
	SlowlogShares []SlowlogShareSample `json:"slowlogShares"`
	HotKeys       []HotKeySample       `json:"hotKeys"`
}

type TelemetryPayload struct {
	AgentID        string            `json:"agentId"`
	Engine         string            `json:"engine"`
	Version        string            `json:"version"`
	CollectedAt    string            `json:"collectedAt"`
	Server         map[string]string `json:"server"`
	Metrics        []MetricSample    `json:"metrics"`
	Slowlog        []SlowlogSample   `json:"slowlog"`
	Keyspace       *KeyspaceSample   `json:"keyspace,omitempty"`
	CommandPicture *CommandPicture   `json:"commandPicture,omitempty"`
}

func metric(name string, value float64, ts time.Time) MetricSample {
	return MetricSample{Name: name, Value: value, Timestamp: ts.UTC().Format(time.RFC3339Nano)}
}
