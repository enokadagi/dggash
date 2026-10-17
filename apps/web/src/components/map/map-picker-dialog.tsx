"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InteractiveMap } from "./interactive-map";
import { MapPin, Search, Check, Navigation, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MapPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: number;
  initialLng?: number;
  initialLocationText?: string;
  onConfirm: (lat: number, lng: number, locationStr: string) => void;
}

const PRESET_LOCATIONS = [
  { name: "Tripoli (Center)", coords: [34.4367, 35.8497] as [number, number] },
  { name: "Al Mina", coords: [34.4442, 35.8239] as [number, number] },
  { name: "Dam & Farz", coords: [34.4312, 35.8398] as [number, number] },
  { name: "Beirut", coords: [33.8938, 35.5018] as [number, number] },
  { name: "Koura", coords: [34.3385, 35.8211] as [number, number] },
  { name: "Akkar / Halba", coords: [34.5422, 36.0805] as [number, number] },
];

export function MapPickerDialog({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  initialLocationText = "",
  onConfirm,
}: MapPickerDialogProps) {
  const [selectedPoint, setSelectedPoint] = React.useState<[number, number] | null>(
    initialLat && initialLng ? [initialLat, initialLng] : [34.4367, 35.8497],
  );

  const [rawInput, setRawInput] = React.useState(initialLocationText);

  // If initial props change when opening
  React.useEffect(() => {
    if (initialLat && initialLng) {
      setSelectedPoint([initialLat, initialLng]);
    } else if (initialLocationText) {
      const parsed = parseCoordinatesFromText(initialLocationText);
      if (parsed) {
        setSelectedPoint([parsed.lat, parsed.lng]);
      }
    }
    setRawInput(initialLocationText);
  }, [initialLat, initialLng, initialLocationText, open]);

  // Parse coordinates from string or Google Maps URL
  function parseCoordinatesFromText(text: string): { lat: number; lng: number } | null {
    if (!text) return null;
    const clean = text.trim();

    // 1. Direct "34.4367, 35.8497" or "34.4367 35.8497"
    const directMatch = clean.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    if (directMatch) {
      const lat = parseFloat(directMatch[1]);
      const lng = parseFloat(directMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    // 2. URL like ".../@34.4367,35.8497,17z"
    const atMatch = clean.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }

    // 3. URL like "q=34.4367,35.8497"
    const qMatch = clean.match(/[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }

    return null;
  }

  const handleInputChange = (val: string) => {
    setRawInput(val);
    const parsed = parseCoordinatesFromText(val);
    if (parsed) {
      setSelectedPoint([parsed.lat, parsed.lng]);
      toast.info(`Coordinates recognized: ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setSelectedPoint([lat, lng]);
    setRawInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  };

  const handleSave = () => {
    if (!selectedPoint) {
      toast.error("Please click on the map to choose a location point");
      return;
    }
    const formattedStr = `${selectedPoint[0].toFixed(6)}, ${selectedPoint[1].toFixed(6)}`;
    onConfirm(selectedPoint[0], selectedPoint[1], formattedStr);
    onOpenChange(false);
    toast.success("Subscriber location coordinates set");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl p-5">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Pin Customer Location on Map</DialogTitle>
              <DialogDescription>
                Click anywhere on the map to set subscriber coordinates, or paste a location link.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          {/* Preset quick jump buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground me-1">Quick Jump:</span>
            {PRESET_LOCATIONS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 py-0"
                onClick={() => {
                  setSelectedPoint(preset.coords);
                  setRawInput(`${preset.coords[0].toFixed(6)}, ${preset.coords[1].toFixed(6)}`);
                }}
              >
                {preset.name}
              </Button>
            ))}
          </div>

          {/* Interactive Map Canvas */}
          <InteractiveMap
            selectedPoint={selectedPoint}
            onLocationSelect={handleMapClick}
            height="360px"
          />

          {/* Location input / Paste box */}
          <div className="space-y-1.5">
            <Label htmlFor="map-coord-input" className="text-xs">
              Selected Coordinates / Google Maps Link
            </Label>
            <div className="flex gap-2">
              <Input
                id="map-coord-input"
                value={rawInput}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="e.g. 34.43670, 35.84970 or Google Maps URL"
                className="font-mono text-xs flex-1"
              />
              {selectedPoint && (
                <div className="flex items-center px-3 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md text-xs font-mono text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5 me-1 text-green-600" />
                  {selectedPoint[0].toFixed(4)}, {selectedPoint[1].toFixed(4)}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Navigation className="h-3 w-3 text-primary" />
              Tip: Click anywhere on the map to drop the subscriber location pin.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!selectedPoint}>
            <Check className="me-1.5 h-4 w-4" />
            Confirm Location Point
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
