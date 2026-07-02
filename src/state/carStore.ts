import { create } from "zustand";

type CarStore = {
  thirdMode: boolean;

  setThirdMode: (thirdMode: boolean) => void;
};

export const useCarStore = create<CarStore>((set) => ({
  thirdMode: false,
  setThirdMode: (thirdMode) => set(() => ({ thirdMode: thirdMode })),
}));
