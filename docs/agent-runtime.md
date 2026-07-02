# Map to GLB Agent Runtime

Map to GLB supports an app-first workflow for local machines, weak GPUs, remote GPU servers, CLIs, MCP clients, terminals, and IDEs. The browser UI can still run during development, but production deployments can phase out the public website with `VITE_DISABLE_PUBLIC_WEB=true`.

## Remote GPU Contract

Remote processing uses one HTTP endpoint:

```http
POST /api/mapglb/process
Authorization: Bearer <optional-api-key>
Content-Type: application/json
```

Request:

```json
{
  "task": "mapglb.buildings.process",
  "version": 1,
  "bounds": {
    "south": 23.7,
    "west": 90.3,
    "north": 23.8,
    "east": 90.4
  },
  "output": "buildings",
  "deviceProfile": {
    "tier": "weak",
    "maxBuildings": 1200
  }
}
```

Fast server response:

```json
{
  "buildings": [
    {
      "id": 1,
      "tags": { "building": "yes", "height": "24" },
      "geometry": [
        { "lat": 23.7, "lng": 90.3 },
        { "lat": 23.7, "lng": 90.31 }
      ]
    }
  ]
}
```

Queued server response:

```json
{
  "jobId": "job_123",
  "status": "queued",
  "statusUrl": "/api/mapglb/jobs/job_123"
}
```

The app, CLI, and MCP bridge poll `statusUrl` until the server returns `buildings`, `elements`, `status: "complete"`, or `status: "failed"`.

## App Settings

Open `Options`, switch `Processing` to `Remote GPU server`, enter the endpoint, and optionally enter an API key. These values are saved in local storage.

`.env.local` can preconfigure the app:

```bash
VITE_REMOTE_GPU_ENDPOINT=https://your-server.example
VITE_DISABLE_PUBLIC_WEB=true
```

`VITE_DISABLE_PUBLIC_WEB=true` blocks non-localhost website access with an app-first notice. Localhost remains available for development.

## CLI

Print the remote contract:

```bash
npm run mapglb:cli -- schema
```

Process bounds on a remote GPU server:

```bash
npm run mapglb:cli -- process --bounds 23.7,90.3,23.8,90.4 --remote https://your-server.example
```

Start the CLI-backed adapter server:

```bash
npm run mapglb:adapter
```

By default, the adapter listens at:

```text
http://127.0.0.1:8787
```

Set the app's remote GPU endpoint to that URL. The app will call:

```text
http://127.0.0.1:8787/api/mapglb/process
```

The adapter then runs the selected CLI provider. The default provider is OpenCode BigPickle:

```bash
MAPGLB_CLI_PROVIDER=opencode-big-pickle
```

That means the local machine only runs the small adapter process and the `opencode` CLI. The AI inference happens through the configured OpenCode/BigPickle provider rather than your local GPU.

Optional environment values:

```bash
MAPGLB_REMOTE_ENDPOINT=https://your-server.example
MAPGLB_REMOTE_API_KEY=secret
MAPGLB_ADAPTER_PORT=8787
MAPGLB_CLI_PROVIDER=opencode-big-pickle
MAPGLB_AI_MODEL=opencode/big-pickle
MAPGLB_CLI_SHELL=false
OPENCODE_CLI_PATH=
```

Supported adapter providers:

- `opencode-big-pickle`: runs `opencode run --model opencode/big-pickle`.
- `opencode`: runs `opencode run --model $MAPGLB_AI_MODEL`.
- `custom`: runs `$MAPGLB_CLI_COMMAND` with `$MAPGLB_CLI_ARGS`.

Custom CLI example:

```bash
MAPGLB_CLI_PROVIDER=custom
MAPGLB_CLI_COMMAND=my-ai-cli
MAPGLB_CLI_ARGS=generate-mapglb {prompt}
npm run mapglb:adapter
```

Set `MAPGLB_CLI_SHELL=true` only when a Windows `.ps1`, `.bat`, or shell-only command needs it.
Set `OPENCODE_CLI_PATH` only if the adapter cannot discover `opencode.ps1` automatically.

## MCP

Start the MCP stdio server:

```bash
npm run mapglb:mcp
```

Available MCP tool:

```text
mapglb_remote_process
```

Required input:

```json
{
  "endpoint": "https://your-server.example",
  "bounds": {
    "south": 23.7,
    "west": 90.3,
    "north": 23.8,
    "east": 90.4
  }
}
```

Optional input:

```json
{
  "apiKey": "secret",
  "deviceProfile": {
    "tier": "remote-agent",
    "maxBuildings": 5000
  }
}
```

## IDE And Terminal

VS Code tasks are included:

- `Map to GLB: Dev App`
- `Map to GLB: Remote Process Schema`
- `Map to GLB: MCP Server`

`agent-manifest.json` describes the same commands and remote GPU contract for agent hosts.

## Liberation War Museum Preset

The app includes a built-in preset for the **Liberation War Museum** in Agargaon, Dhaka, Bangladesh (GPS: 23.7727, 90.37596). On the map page, click the **Presets** bar at the bottom-left and select **Liberation War Museum** to automatically select the museum area with rectangle bounds. The museum also appears in the search suggestions dropdown.

When viewing the Dhaka area, a stylized landmark marker (green pillar with red top, referencing the Bangladesh flag) appears in the 3D scene with a floating "Liberation War Museum" label. The marker is built from Three.js primitives only - no external assets required.
