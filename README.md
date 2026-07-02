<p align='center'>
<h1 align='center'>Map to GLB</h1>
<p align='center'>Generate a real world 3D map and export as GLB</p>
</p>

<p align='center'>
<a href="https://github.com/farhanic017/map-to-glb/issues">Report Bugs</a>
</p>

![Map to GLB Screenshot](./.github/screenshot.png)

## About The Project

Map to GLB is a 3D building mapping service implemented with [React-Three-Fiber](https://github.com/pmndrs/react-three-fiber). It allows exporting as a GLB file, and all features are free to use. Based on this project, various functionalities such as **digital twin**, **drone surveying**, and **GPS markers** can be implemented.

The map selector supports several free basemaps by default: OpenStreetMap, CARTO Light/Dark, Esri Satellite, and OpenTopoMap. It also supports Google Maps, MapTiler, and Mapbox when a valid API key is entered in the map provider panel. These maps are used as selection basemaps; exported 3D building and road geometry still comes from OpenStreetMap/Overpass data.

## App-First Runtime

Map to GLB supports an app-first workflow for local machines, weak GPUs, remote GPU servers, CLIs, MCP clients, terminals, and IDEs. Development still works in the browser, but production website access can be disabled with:

```bash
VITE_DISABLE_PUBLIC_WEB=true
```

Localhost stays enabled for development. Public hosts show an app-first notice when the flag is active.

## Map API Keys

Select an API-backed provider from the map menu, paste its key into the box, and press Enter. The key is saved in local browser storage and used immediately.

Google Maps can also be preconfigured by creating `.env.local` from `.env.example`, setting `VITE_GOOGLE_MAPS_API_KEY`, and restarting the dev server. Google Maps requires an enabled Maps JavaScript API key and Google Cloud billing.

## Remote GPU Processing

Users with weak GPUs can switch `Options > Compute Runtime > Processing` to `Remote GPU server`, enter a server endpoint, and let the server process selected map bounds. Remote processing can take longer than local processing because work is queued on the remote machine and returned when ready.

Preconfigure a remote endpoint with:

```bash
VITE_REMOTE_GPU_ENDPOINT=https://your-server.example
```

The app, CLI, and MCP bridge all use the same remote contract. See [docs/agent-runtime.md](docs/agent-runtime.md).

## Realistic Materials

The default material preset is `Real Life Auto`. It reads OpenStreetMap tags such as `building`, `building:material`, `roof:material`, and `roof:colour` to choose practical facade and roof styles automatically. Buildings use generated PBR-style procedural maps for facade color, bump, roughness, emissive windows, and roof detail. Roads use asphalt strips with lane markings instead of flat colored lines, and terrain can use textured ground materials when heightmap is enabled.

## CLI, MCP, Terminal, And IDE

Print the processing schema:

```bash
npm run mapglb:cli -- schema
```

Run remote processing:

```bash
npm run mapglb:cli -- process --bounds 23.7,90.3,23.8,90.4 --remote https://your-server.example
```

Start the MCP server:

```bash
npm run mapglb:mcp
```

Start the BigPickle/OpenCode adapter:

```bash
npm run mapglb:adapter
```

Then set the app remote endpoint to:

```text
http://127.0.0.1:8787
```

VS Code tasks and `agent-manifest.json` are included for IDE and agent host integration.

> [!IMPORTANT]
> <strong>This project cannot guarantee the accuracy of the data.</strong> Since it uses OpenStreetMap data, some height values may be missing or incorrectly recorded. To address this issue, an option will be added in the future to allow users to manually correct the data.

## Roadmap

- [x] Create 3D Buildings
- [x] Create Roads
- [x] Export GLB
- [x] Building Texture
- [x] Height Customization
- [x] Material
- [x] Heightmap
- [x] Google Maps Provider
- [x] Multiple Free/API Map Providers
- [x] Remote GPU Processing
- [x] CLI
- [x] MCP
- [x] Agent Manifest
- [x] IDE Tasks
- [x] Real Life Auto Materials
- [x] OctoCode Integration
- [x] Search API Support

## Demo

https://github.com/user-attachments/assets/1b61c2f8-dcf9-40bb-9804-59f6a74594dc

## Contributors

Farhan Dhrubo [(GitHub)](https://github.com/farhanic017)

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
