#!/usr/bin/env node

const POLL_INTERVAL_MS = 2500;
const REMOTE_TIMEOUT_MS = 1000 * 60 * 4;

function usage() {
  console.log(`Map to GLB CLI

Commands:
  schema
  process --bounds south,west,north,east --remote https://server [--api-key key]

Environment:
  MAPGLB_REMOTE_ENDPOINT  Remote GPU server base URL
  MAPGLB_REMOTE_API_KEY   Optional bearer token
`);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    index += 1;
  }

  return { command, options };
}

function parseBounds(value) {
  if (!value) throw new Error("--bounds is required.");

  const [south, west, north, east] = value.split(",").map(Number);
  if ([south, west, north, east].some((number) => Number.isNaN(number))) {
    throw new Error("--bounds must be south,west,north,east.");
  }

  return { south, west, north, east };
}

function buildProcessUrl(endpoint) {
  const trimmedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (!trimmedEndpoint) throw new Error("Remote GPU endpoint is empty.");
  if (trimmedEndpoint.endsWith("/process")) return trimmedEndpoint;
  return `${trimmedEndpoint}/api/mapglb/process`;
}

function resolveStatusUrl(processUrl, statusUrl) {
  return new URL(statusUrl, processUrl).toString();
}

function normalizeBuildings(response) {
  if (Array.isArray(response.buildings)) return response.buildings;

  if (Array.isArray(response.elements)) {
    return response.elements.map((element) => ({
      id: element.id,
      tags: element.tags || {},
      geometry: element.geometry?.map((point) => ({
        lat: point.lat,
        lng: point.lng ?? point.lon ?? 0,
      })),
    }));
  }

  return [];
}

async function postJson(url, apiKey, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Remote GPU server returned ${response.status}.`);
  }

  return response.json();
}

async function getJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Remote GPU job returned ${response.status}.`);
  }

  return response.json();
}

async function requestRemoteBuildings({ endpoint, apiKey, bounds }) {
  const processUrl = buildProcessUrl(endpoint);
  const startedAt = Date.now();
  const body = {
    task: "map3d.buildings.process",
    version: 1,
    bounds,
    output: "buildings",
    deviceProfile: {
      tier: "remote-cli",
      maxBuildings: 5000,
      requestTimeoutMs: REMOTE_TIMEOUT_MS,
    },
  };
  const initialResponse = await postJson(processUrl, apiKey, body);

  let buildings = normalizeBuildings(initialResponse);
  if (buildings.length > 0) return { buildings, response: initialResponse };

  if (!initialResponse.statusUrl) {
    throw new Error(
      initialResponse.error || "Remote GPU server returned no buildings."
    );
  }

  const statusUrl = resolveStatusUrl(processUrl, initialResponse.statusUrl);
  while (Date.now() - startedAt < REMOTE_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const statusResponse = await getJson(statusUrl, apiKey);

    if (statusResponse.status === "failed") {
      throw new Error(statusResponse.error || "Remote GPU job failed.");
    }

    buildings = normalizeBuildings(statusResponse);
    if (buildings.length > 0 || statusResponse.status === "complete") {
      return { buildings, response: statusResponse };
    }
  }

  throw new Error("Remote GPU job timed out.");
}

function printSchema() {
  console.log(
    JSON.stringify(
      {
        endpoint: "/api/map3d/process",
        method: "POST",
        auth: "Optional Authorization: Bearer <api-key>",
        request: {
          task: "map3d.buildings.process",
          version: 1,
          bounds: { south: 23.7, west: 90.3, north: 23.8, east: 90.4 },
          output: "buildings",
          deviceProfile: {},
        },
        syncResponse: {
          buildings: [
            {
              id: 1,
              tags: { height: "24", building: "yes" },
              geometry: [
                { lat: 23.7, lng: 90.3 },
                { lat: 23.7, lng: 90.31 },
              ],
            },
          ],
        },
        asyncResponse: {
          jobId: "job_123",
          status: "queued",
          statusUrl: "/api/map3d/jobs/job_123",
        },
      },
      null,
      2
    )
  );
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "schema") {
    printSchema();
    return;
  }

  if (command === "process") {
    const endpoint =
      options.remote ||
      process.env.MAPGLB_REMOTE_ENDPOINT ||
      process.env.VITE_REMOTE_GPU_ENDPOINT ||
      "";
    const apiKey = options["api-key"] || process.env.MAPGLB_REMOTE_API_KEY || "";
    const bounds = parseBounds(options.bounds);
    const result = await requestRemoteBuildings({ endpoint, apiKey, bounds });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
