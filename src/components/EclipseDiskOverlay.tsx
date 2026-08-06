import { useId } from "react";
import type { SkyState } from "../types";
import { signedAngleDelta } from "../phone-alignment";

export function EclipseDiskOverlay({
  state,
  visible,
}: {
  state: SkyState;
  visible: boolean;
}) {
  const gradientPrefix = useId().replace(/:/g, "");
  const sunGradientId = `${gradientPrefix}-sun`;
  const coronaGradientId = `${gradientPrefix}-corona`;
  const sunRadius = state.sun.angularDiameterDeg / 2;
  const scale = 30 / sunRadius;
  const moonRadius = (state.moon.angularDiameterDeg / 2) * scale;
  const azimuthDelta =
    signedAngleDelta(state.sun.azimuthDeg, state.moon.azimuthDeg) *
    Math.cos((state.sun.altitudeDeg * Math.PI) / 180);
  const moonX = azimuthDelta * scale;
  const moonY = -(state.moon.altitudeDeg - state.sun.altitudeDeg) * scale;

  return (
    <svg
      className={`alignment-eclipse ${visible ? "visible" : ""}`}
      viewBox="-82 -82 164 164"
      role="img"
      aria-label={`${Math.round(state.eclipse.obscurationPercent)} percent solar coverage at the selected time; disk sizes and center separation are magnified together, preserving the physical overlap.`}
    >
      <defs>
        <radialGradient id={sunGradientId} cx="35%" cy="32%">
          <stop offset="0" stopColor="#fffbd0" />
          <stop offset="0.62" stopColor="#ffd36a" />
          <stop offset="1" stopColor="#f58a45" />
        </radialGradient>
        <radialGradient id={coronaGradientId}>
          <stop offset="0.2" stopColor="#fff3cc" stopOpacity=".78" />
          <stop offset="1" stopColor="#ff9b62" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        className="alignment-corona"
        r="68"
        fill={`url(#${coronaGradientId})`}
      />
      <circle r="30" fill={`url(#${sunGradientId})`} />
      <circle cx={moonX} cy={moonY} r={moonRadius} fill="#02050b" />
    </svg>
  );
}
