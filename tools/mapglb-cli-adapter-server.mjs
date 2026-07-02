#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import http from "node:http";

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 1000 * 60 * 6;

function parseCommandLineArgs(value) {
  const args = [];
  let current = "";
  let quote = "";
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

const presets = {
  octocode: {
    label: "OctoCode",
    command: "octocode",
    args: ["run", "--model", process.env.MAPGLB_AI_MODEL || "gpt-4", "{prompt}"],
  },
  custom: {
    label: "Custom CLI",
    command: process.env.MAPGLB_CLI_COMMAND || "",
    args: parseCommandLineArgs(process.env.MAPGLB_CLI_ARGS || "{prompt}"),
  },
};

function resolveWindowsOpenCodePath() {
  const configuredPath = process.env.OPENCODE_CLI_PATH;
  if (configuredPath) return configuredPath;

  const whereResult = spawnSync("where.exe", ["opencode"], {
    encoding: "utf8",
  });
  const wherePath = whereResult.stdout
    ?.split(/\r?\n/)
    .find((line) => line.trim().endsWith(".ps1"));
  if (wherePath) return wherePath.trim();

  const commandResult = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "(Get-Command opencode -ErrorAction SilentlyContinue).Source",
    ],
    { encoding: "utf8" }
  );
  const commandPath = commandResult.stdout
    ?.split(/\r?\n/)
    .find((line) => line.trim().endsWith(".ps1"));

  return commandPath?.trim() || "";
}

function parseArgs(argv) {
  const options = {
    host: process.env.MAP3D_ADAPTER_HOST || DEFAULT_HOST,
    port: Number(process.env.MAP3D_ADAPTER_PORT || DEFAULT_PORT),
    provider: process.env.MAP3D_CLI_PROVIDER || "opencode-big-pickle",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    index += 1;
  }

  options.port = Number(options.port);
  return options;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function statusForError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Request body") ||
    message.includes("bounds.") ||
    message.includes("Unknown provider") ||
    message.includes("Custom CLI requires")
  ) {
    return 400;
  }

  if (message.includes("timed out")) return 504;
  if (message.includes("exited with") || message.includes("spawn")) return 502;

  return 500;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function validateBounds(bounds) {
  const required = ["south", "west", "north", "east"];
  for (const key of required) {
    if (typeof bounds?.[key] !== "number") {
      throw new Error(`bounds.${key} must be a number.`);
    }
  }
}

function buildPrompt(payload) {
  const { bounds, deviceProfile } = payload;
  return `You are running on a remote AI server for Map3D.
Return JSON only. Do not write prose.

Task:
Generate Map3D-compatible building geometry for the selected area. Use the
given bounds and prefer real-world landmark knowledge when the bounds include
the Liberation War Museum in Agargaon, Dhaka, Bangladesh. Keep geometry compact.

Output schema:
{
  "buildings": [
    {
      "id": number,
      "tags": {
        "building": "yes",
        "name": string,
        "height": string,
        "source": "ai-cli"
      },
      "geometry": [
        { "lat": number, "lng": number }
      ]
    }
  ]
}

Bounds:
${JSON.stringify(bounds)}

Device profile:
${JSON.stringify(deviceProfile || {})}`;
}

function extractJson(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("CLI returned empty output.");

  const parseJsonLike = (value) => {
    const normalized = value
      .trim()
      .replace(/^`+|`+$/g, "")
      .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, "$1");

    return JSON.parse(normalized);
  };

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return parseJsonLike(fenced[1]);

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return parseJsonLike(trimmed.slice(firstBrace, lastBrace + 1));
    }
  }

  throw new Error("CLI output did not contain valid JSON.");
}

function normalizeBuildings(payload) {
  if (Array.isArray(payload.buildings)) return payload.buildings;

  if (Array.isArray(payload.elements)) {
    return payload.elements.map((element) => ({
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

function runCliProvider({ provider, prompt, input }) {
  const preset = presets[provider];
  if (!preset) {
    throw new Error(
      `Unknown provider "${provider}". Use one of: ${Object.keys(presets).join(
        ", "
      )}.`
    );
  }

  if (!preset.command) {
    throw new Error("Custom CLI requires MAP3D_CLI_COMMAND.");
  }

  const args = preset.args.map((arg) =>
    arg
      .replaceAll("{prompt}", prompt)
      .replaceAll("{input}", JSON.stringify(input))
  );

  let command = preset.command;
  let cliArgs = args;

  if (process.platform === "win32" && preset.command === "opencode") {
    const opencodePath = resolveWindowsOpenCodePath();

    if (opencodePath) {
      command = "powershell.exe";
      cliArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        opencodePath,
        ...args,
      ];
    }
  }

  return new Promise((resolve, reject) => {
    const useShell = process.env.MAP3D_CLI_SHELL === "true";
    const child = spawn(command, cliArgs, {
      cwd: process.cwd(),
      env: process.env,
      shell: useShell,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdin?.end();

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${preset.label} timed out.`));
    }, Number(process.env.MAP3D_CLI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `${preset.label} exited with ${code}: ${stderr || stdout}`.trim()
          )
        );
        return;
      }

      resolve(stdout);
    });
  });
}

async function handleProcess(request, response, options) {
  const payload = await readJson(request);
  validateBounds(payload.bounds);

  const provider = payload.provider || options.provider;
  const prompt = payload.prompt || buildPrompt(payload);
  const output = await runCliProvider({ provider, prompt, input: payload });
  const parsed = extractJson(output);
  const buildings = normalizeBuildings(parsed);

  sendJson(response, 200, {
    buildings,
    provider,
    runtime: "cli-adapter",
    source: "remote-ai-cli",
    raw: parsed,
  });
}

function createServer(options) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");

      if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          runtime: "cli-adapter",
          provider: options.provider,
          providers: Object.keys(presets),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/mapglb/providers") {
        sendJson(response, 200, {
          defaultProvider: options.provider,
          providers: Object.entries(presets).map(([id, preset]) => ({
            id,
            label: preset.label,
          })),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/mapglb/process") {
        await handleProcess(request, response, options);
        return;
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, statusForError(error), {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

const options = parseArgs(process.argv.slice(2));
const server = createServer(options);

server.listen(options.port, options.host, () => {
  console.log(
    `Map3D CLI adapter listening on http://${options.host}:${options.port}`
  );
  console.log(`Provider: ${options.provider}`);
});
