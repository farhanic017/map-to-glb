import { create } from "zustand";

type AreaStore = {
  areas: any;
  center: {
    lat: number;
    lng: number;
  }[];

  appendAreas: (areas: any[]) => void;
  clearAreas: () => void;
  setCenter: (center: any[]) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
  center: [
    {
      lat: 40.8,
      lng: -73.95,
    },
    {
      lat: 40.83,
      lng: -73.88,
    },
  ],
  appendAreas: (areas) => set(() => ({ areas: [...areas] })),
  clearAreas: () => set(() => ({ areas: [] })),
  setCenter: (center) => set(() => ({ center: [...center] })),
}));
