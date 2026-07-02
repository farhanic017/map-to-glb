import { create } from "zustand";

export type ExportFilter = "all" | "buildings" | "routes" | "surfaces" | "points";
export type ExportStatus = "idle" | "exporting" | "success" | "error";

type ActionStore = {
  action: boolean;
  fleetSpaceId: string;
  exportType: "glb" | "fleet";
  exportFilter: ExportFilter;
  exportStatus: ExportStatus;
  exportError: string | null;

  setAction: (action: boolean) => void;
  setFleet: (fleetSpaceId: string, exportType: "glb" | "fleet") => void;
  setExportFilter: (filter: ExportFilter) => void;
  setExportStatus: (status: ExportStatus) => void;
  setExportError: (error: string | null) => void;
};

export const useActionStore = create<ActionStore>((set) => ({
  action: false,
  fleetSpaceId: "",
  exportType: "glb",
  exportFilter: "all",
  exportStatus: "idle",
  exportError: null,

  setAction: (action) => set(() => ({ action })),
  setFleet: (fleetSpaceId, exportType) =>
    set(() => ({ fleetSpaceId, exportType })),
  setExportFilter: (exportFilter) => set(() => ({ exportFilter })),
  setExportStatus: (exportStatus) => set(() => ({ exportStatus })),
  setExportError: (exportError) => set(() => ({ exportError })),
}));
