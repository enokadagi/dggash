"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  planName?: string;
  phone?: string;
  color?: "green" | "amber" | "red" | "gray";
  badge?: string;
  onClickUrl?: string;
}

interface InteractiveMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  selectedPoint?: [number, number] | null;
  onLocationSelect?: (lat: number, lng: number) => void;
  height?: string;
  className?: string;
}

const MapInnerDynamic = dynamic(() => import("./map-inner"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
      <p className="text-xs text-muted-foreground">Loading interactive map…</p>
    </div>
  ),
});

export function InteractiveMap({
  center = [34.4367, 35.8497], // Default: Tripoli, Lebanon
  zoom = 13,
  markers = [],
  selectedPoint = null,
  onLocationSelect,
  height = "420px",
  className = "",
}: InteractiveMapProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-muted/20 ${className}`}
      style={{ height, zIndex: 0 }}
    >
      <MapInnerDynamic
        center={center}
        zoom={zoom}
        markers={markers}
        selectedPoint={selectedPoint}
        onLocationSelect={onLocationSelect}
      />
    </div>
  );
}
