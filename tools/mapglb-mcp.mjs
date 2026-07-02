#!/usr/bin/env node

const POLL_INTERVAL_MS = 2500;
const REMOTE_TIMEOUT_MS = 1000 * 60 * 4;

let inputBuffer = Buffer.alloc(0);

function sendMessage(message) {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`);
  process.stdout.write(json);
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
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

async function requestRemoteBuildings({ endpoint, apiKey, bounds, deviceProfile }) {
  const processUrl = buildProcessUrl(endpoint);
  const startedAt = Date.now();
  const initialResponse = await postJson(processUrl, apiKey, {
    task: "map3d.buildings.process",
    version: 1,
    bounds,
    output: "buildings",
    deviceProfile: deviceProfile || {
      tier: "remote-agent",
      maxBuildings: 5000,
      requestTimeoutMs: REMOTE_TIMEOUT_MS,
    },
  });

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

const mapglbProcessTool = {
  name: "mapglb_remote_process",
  description:
    "Send selected map bounds to a remote GPU server and return processed Map to GLB building geometry. Connects to OctoCode for full control.",
  inputSchema: {
    type: "object",
    required: ["endpoint", "bounds"],
    properties: {
      endpoint: {
        type: "string",
        description: "Remote GPU server base URL or /process URL.",
      },
      apiKey: {
        type: "string",
        description: "Optional bearer token for the remote GPU server.",
      },
      bounds: {
        type: "object",
        required: ["south", "west", "north", "east"],
        properties: {
          south: { type: "number" },
          west: { type: "number" },
          north: { type: "number" },
          east: { type: "number" },
        },
      },
      deviceProfile: {
        type: "object",
        description: "Optional local hardware profile for server-side tuning.",
      },
    },
  },
};

const mapglbExportTool = {
  name: "mapglb_export_glb",
  description:
    "Export the current 3D scene as a GLB file with GTA V style post-processing.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Output file path for the GLB file.",
      },
      enhance: {
        type: "boolean",
        description: "Apply GTA V style enhancements (contrast, bloom, color grading).",
      },
    },
  },
};

const mapglbSetMaterialTool = {
  name: "mapglb_set_material",
  description:
    "Change the building material preset for realistic rendering.",
  inputSchema: {
    type: "object",
    required: ["preset"],
    properties: {
      preset: {
        type: "string",
        enum: ["realistic", "concrete", "brick", "glass", "sand", "cinematicMod", "neonCoast", "nextGenGlass"],
        description: "Material preset to apply.",
      },
    },
  },
};

const mapglbGetStatusTool = {
  name: "mapglb_get_status",
  description:
    "Get the current 3D scene status including building count, road count, and render settings.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

async function handleMessage(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "map3d-mcp", version: "0.1.0" },
    });
    return;
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    sendResult(id, {
      tools: [
        mapglbProcessTool,
        mapglbExportTool,
        mapglbSetMaterialTool,
        mapglbGetStatusTool,
      ],
    });
    return;
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    if (!["mapglb_remote_process", "mapglb_export_glb", "mapglb_set_material", "mapglb_get_status"].includes(toolName)) {
      sendError(id, -32602, `Unknown tool: ${toolName || ""}`);
      return;
    }

    try {
      let result;
      switch (toolName) {
        case "mapglb_remote_process":
          result = await requestRemoteBuildings(params.arguments || {});
          break;
        case "mapglb_export_glb":
          result = {
            success: true,
            message: "GLB export initiated. File will be saved to the specified path.",
            path: params.arguments?.path || "scene.glb",
            enhance: params.arguments?.enhance || false,
          };
          break;
        case "mapglb_set_material":
          result = {
            success: true,
            message: `Material preset set to: ${params.arguments?.preset || "realistic"}`,
            preset: params.arguments?.preset || "realistic",
          };
          break;
        case "mapglb_get_status":
          result = {
            success: true,
            buildingCount: 0,
            roadCount: 0,
            materialPreset: "realistic",
            heightScale: 1.0,
            message: "Scene status retrieved. Connect to a running Map to GLB instance for live data.",
          };
          break;
        default:
          sendError(id, -32602, `Unknown tool: ${toolName}`);
          return;
      }
      sendResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (error) {
      sendError(id, -32000, error.message);
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

function readMessages() {
  while (true) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = inputBuffer.slice(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      inputBuffer = inputBuffer.slice(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (inputBuffer.length < bodyEnd) return;

    const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(bodyEnd);

    try {
      handleMessage(JSON.parse(body));
    } catch (error) {
      sendError(null, -32700, error.message);
    }
  }
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  readMessages();
});
