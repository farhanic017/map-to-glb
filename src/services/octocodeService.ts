/**
 * OctoCode Integration Service for Map to GLB
 * Copyright (C) 2026 Farhan Dhrubo
 * Licensed under GNU General Public License v3.0
 * https://github.com/farhanic017/map-to-glb
 */

export type OctocodeCommand =
  | "export_glb"
  | "get_scene_status"
  | "set_material"
  | "set_height"
  | "modify_texture"
  | "add_detail";

export type OctocodeRequest = {
  command: OctocodeCommand;
  params: Record<string, unknown>;
};

export type OctocodeResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

const OCTOCODE_ENDPOINT = "http://127.0.0.1:4096";

export async function sendOctocodeCommand(
  request: OctocodeRequest
): Promise<OctocodeResponse> {
  try {
    const response = await fetch(`${OCTOCODE_ENDPOINT}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: formatOctocodePrompt(request),
      }),
    });

    if (!response.ok) {
      throw new Error(`OctoCode server returned ${response.status}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "OctoCode connection failed",
    };
  }
}

function formatOctocodePrompt(request: OctocodeRequest): string {
  const { command, params } = request;

  switch (command) {
    case "export_glb":
      return `Export the current 3D scene as a GLB file. Save it to: ${params.path || "scene.glb"}. Apply GTA V style post-processing: enhance contrast, add slight bloom, adjust color grading for realistic look.`;

    case "get_scene_status":
      return "Get the current 3D scene status including building count, road count, and render settings.";

    case "set_material":
      return `Change the building material preset to "${params.preset}". Apply realistic PBR materials with proper roughness, metalness, and normal maps.`;

    case "set_height":
      return `Adjust the height scale to ${params.scale}. Apply realistic building proportions.`;

    case "modify_texture":
      return `Modify the ${params.target} texture with GTA V style enhancements: add weathering, stains, and realistic surface details.`;

    case "add_detail":
      return `Add ${params.detailType} details to the scene. Include realistic ${params.detailType} with proper materials and placement.`;

    default:
      return `Execute command: ${command} with params: ${JSON.stringify(params)}`;
  }
}

export async function exportGLBWithOctocode(
  path: string = "scene.glb"
): Promise<OctocodeResponse> {
  return sendOctocodeCommand({
    command: "export_glb",
    params: { path },
  });
}

export async function getSceneStatus(): Promise<OctocodeResponse> {
  return sendOctocodeCommand({
    command: "get_scene_status",
    params: {},
  });
}

export async function setMaterial(
  preset: string
): Promise<OctocodeResponse> {
  return sendOctocodeCommand({
    command: "set_material",
    params: { preset },
  });
}

export async function modifyTexture(
  target: string,
  style: string = "gta5"
): Promise<OctocodeResponse> {
  return sendOctocodeCommand({
    command: "modify_texture",
    params: { target, style },
  });
}

export async function addDetail(
  detailType: string
): Promise<OctocodeResponse> {
  return sendOctocodeCommand({
    command: "add_detail",
    params: { detailType },
  });
}

export function isOctocodeConnected(): Promise<boolean> {
  return fetch(`${OCTOCODE_ENDPOINT}/health`)
    .then((res) => res.ok)
    .catch(() => false);
}
