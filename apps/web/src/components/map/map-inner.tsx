"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";
import { MapMarker } from "./interactive-map";

// Fix missing default icons in Next.js + Leaflet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapInnerProps {
  center: [number, number];
  zoom: number;
  markers: MapMarker[];
  selectedPoint: [number, number] | null;
  onLocationSelect?: (lat: number, lng: number) => void;
}

export default function MapInner({
  center,
  zoom,
  markers,
  selectedPoint,
  onLocationSelect,
}: MapInnerProps) {
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);
  const markersLayerRef = React.useRef<LayerGroup | null>(null);
  const selectedMarkerRef = React.useRef<Marker | null>(null);

  // ── 1. Init Map ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return;

    const initialCenter = selectedPoint ?? center;

    // IMPORTANT: zoomAnimation: false and fadeAnimation: false prevent
    // "_leaflet_pos of undefined" crash caused by unmount during CSS transitions
    const map = L.map(mapContainer.current, {
      center: initialCenter,
      zoom,
      zoomControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      trackResize: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    if (onLocationSelect) {
      map.on("click", (e) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const lng = parseFloat(e.latlng.lng.toFixed(6));
        onLocationSelect(lat, lng);
      });
    }

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    // ResizeObserver ensures map redraws when tabs open or modals resize
    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        try {
          mapRef.current.invalidateSize({ debounceMoveend: true });
        } catch {
          // Ignore resize errors during lifecycle
        }
      }
    });

    if (mapContainer.current) {
      observer.observe(mapContainer.current);
    }

    // Initial size recalculation
    setTimeout(() => {
      if (mapRef.current) {
        try {
          mapRef.current.invalidateSize();
        } catch {
          // ignore
        }
      }
    }, 100);

    return () => {
      observer.disconnect();
      if (mapRef.current) {
        try {
          mapRef.current.stop();
          mapRef.current.off();
          mapRef.current.remove();
        } catch {
          // Ignore cleanup errors
        } finally {
          mapRef.current = null;
          markersLayerRef.current = null;
          selectedMarkerRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Selected-point pin ─────────────────────────────────────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedMarkerRef.current) {
      try {
        selectedMarkerRef.current.remove();
      } catch {
        // ignore
      }
      selectedMarkerRef.current = null;
    }

    if (!selectedPoint?.[0] || !selectedPoint?.[1]) return;

    try {
      const pinIcon = L.divIcon({
        className: "custom-pin",
        html: `<div style="
            background:#2563eb;color:white;border-radius:50%;
            width:32px;height:32px;display:flex;align-items:center;
            justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.3);
            border:2px solid white;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker(selectedPoint, { icon: pinIcon }).addTo(map);
      marker.bindPopup(
        `<div style="font-family:sans-serif;font-size:13px">
           <strong>Selected Location</strong><br/>
           Lat: ${selectedPoint[0].toFixed(5)}, Lng: ${selectedPoint[1].toFixed(5)}
         </div>`
      );
      selectedMarkerRef.current = marker;
      map.setView(selectedPoint, map.getZoom(), { animate: false });
    } catch {
      // Ignore
    }
  }, [selectedPoint]);

  // ── 3. Multi-user markers ─────────────────────────────────────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    try {
      layer.clearLayers();
      if (!markers || markers.length === 0) return;

      const bounds = L.latLngBounds([]);

      markers.forEach((m) => {
        if (!m.lat || !m.lng || isNaN(m.lat) || isNaN(m.lng)) return;

        const colorHex =
          m.color === "green"
            ? "#16a34a"
            : m.color === "amber"
            ? "#d97706"
            : m.color === "red"
            ? "#dc2626"
            : "#6b7280";

        const icon = L.divIcon({
          className: "subscriber-pin",
          html: `<div style="
              background:${colorHex};color:white;border-radius:50%;
              width:28px;height:28px;display:flex;align-items:center;
              justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.35);
              border:2px solid white;cursor:pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });

        const popupHtml = `
          <div style="font-family:sans-serif;font-size:12px;min-width:170px;padding:2px;">
            <div style="font-weight:bold;font-size:13px;color:#111827;margin-bottom:2px;">${m.title}</div>
            ${m.subtitle ? `<div style="color:#6b7280;font-size:11px;margin-bottom:4px;">${m.subtitle}</div>` : ""}
            ${m.planName ? `<div style="margin-bottom:4px;"><strong>Plan:</strong> ${m.planName}</div>` : ""}
            ${m.phone ? `<div style="margin-bottom:4px;"><strong>Phone:</strong> ${m.phone}</div>` : ""}
            <div style="margin-top:6px;display:flex;gap:4px;align-items:center;">
              <span style="display:inline-block;padding:2px 8px;border-radius:9999px;
                font-size:10px;font-weight:600;
                background:${colorHex}20;color:${colorHex};border:1px solid ${colorHex}40;">
                ${m.badge ?? "Subscriber"}
              </span>
              ${m.onClickUrl
                ? `<a href="${m.onClickUrl}" style="margin-left:auto;font-size:11px;color:#2563eb;text-decoration:underline;font-weight:500;">View &rarr;</a>`
                : ""}
            </div>
          </div>`;

        const marker = L.marker([m.lat, m.lng], { icon });
        marker.bindPopup(popupHtml);
        layer.addLayer(marker);
        bounds.extend([m.lat, m.lng]);
      });

      if (markers.length > 0 && bounds.isValid() && !selectedPoint) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
      }
    } catch {
      // Ignore errors during layer rendering
    }
  }, [markers, selectedPoint]);

  return (
    <div
      ref={mapContainer}
      style={{ height: "100%", width: "100%", zIndex: 1 }}
    />
  );
}
