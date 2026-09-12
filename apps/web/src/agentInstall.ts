const viteEnv =
  typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env === "object"
    ? (import.meta.env as Record<string, string | undefined>)
    : undefined;

export const AGENT_IMAGE =
  viteEnv?.VITE_AGENT_IMAGE ?? "ghcr.io/kartikeytandon/baltan:v0.0.5";

export function ingestUrlForDocker(origin = typeof window !== "undefined" ? window.location.origin : "https://baltan.xyz"): string {
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://host.docker.internal:3001";
    }
    return `${window.location.origin}/api`;
  }
  return `${origin.replace(/\/$/, "")}/api`;
}

export function agentInstallCommands(opts: {
  token: string | null;
  agentKey: string;
  engine: string;
  ingestUrl?: string;
  image?: string;
}) {
  const { token, agentKey, engine } = opts;
  const tokenVal = token ?? "<paste-token-after-signup>";
  const ingest = opts.ingestUrl ?? ingestUrlForDocker();
  const image = opts.image ?? AGENT_IMAGE;
  const run = `docker pull ${image}

docker run -d --name baltan-agent --restart unless-stopped \\
  -e AGENT_TOKEN='${tokenVal}' \\
  --add-host=host.docker.internal:host-gateway \\
  ${image} \\
  --addr host.docker.internal:6379 \\
  --engine ${engine} \\
  --agent-id ${agentKey} \\
  --ingest-url ${ingest} \\
  --interval 10s`;
  const compose = `export AGENT_TOKEN='${tokenVal}'
export AGENT_ID='${agentKey}'
export INGEST_URL='${ingest}'
export REDIS_ADDR=host.docker.internal:6379
export REDIS_ENGINE=${engine}
docker compose -f docker-compose.agent.yaml up -d`;
  const build = `# Fallback if GHCR pull is private — build from apps/agent:
docker build -t baltan:v0.0.5 .
# then replace ${image} with baltan:v0.0.5 in the run command`;
  return { ingest, run, compose, build, image };
}
