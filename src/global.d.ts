import * as THREE from "three";
import { Object3DNode } from "@react-three/fiber";

declare global {
  interface Window {
    google?: any;
    __TAURI__?: any;
  }

  namespace JSX {
    interface IntrinsicElements {
      "three-line": Object3DNode<THREE.Line, typeof THREE.Line>;
    }
  }
}
