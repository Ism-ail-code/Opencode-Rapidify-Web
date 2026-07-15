/**
 * Contract consumed by Rapidify's native/mobile AR clients. The web viewer uses
 * the compatible model-viewer options; native clients can request the same
 * fields from getMobileARAsset without guessing product state.
 */
export const mobileARBehavior = {
  initialPlacementDistanceMeters: 2,
  singleFingerDrag: true,
  twoFingerPinchZoom: true,
  singleFingerRotationRing: true,
  targetFrameRate: 60,
} as const;

export type MobileARAsset = {
  productId: string;
  title: string;
  imageUrl: string;
  modelUrl: string | null;
  usdzUrl: string | null;
  arReady: boolean;
  behavior: typeof mobileARBehavior;
};
