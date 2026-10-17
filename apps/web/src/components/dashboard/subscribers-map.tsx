"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { InteractiveMap, type MapMarker } from "@/components/map/interactive-map";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface CustomerWithSub {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsappNumber?: string | null;
  city?: string | null;
  address?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  subscriptions?: Array<{
    id: string;
    status: string;
    paymentStatus?: string;
    startDate: string;
    expiryDate: string;
    plan?: { id: string; name: string; speed?: string };
  }>;
}

interface CustomersApiResponse {
  data: CustomerWithSub[];
  total: number;
}

export function SubscribersMapCard() {
  const [filter, setFilter] = React.useState<"all" | "paid" | "expiring" | "unpaid">("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["subscribers-coverage-map"],
    queryFn: () => api.get<CustomersApiResponse>("/customers", { limit: 100 }),
    refetchInterval: 60000,
  });

  const customers = data?.data || [];

  // Parse and build map markers
  const allMarkers = React.useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];

    customers.forEach((c) => {
      let lat = c.latitude;
      let lng = c.longitude;

      // Fallback: parse from location string if not numeric
      if ((!lat || !lng) && c.location) {
        const match = c.location.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
        if (match) {
          lat = parseFloat(match[1]);
          lng = parseFloat(match[2]);
        }
      }

      // If valid coordinates exist
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const sub = c.subscriptions?.[0];
        let color: "green" | "amber" | "red" | "gray" = "gray";
        let badge = "No Plan";

        if (sub) {
          const isPaid = sub.paymentStatus === "paid";
          if (sub.status === "ACTIVE" && isPaid) {
            color = "green";
            badge = "Paid & Active";
          } else if (sub.status === "EXPIRING_SOON" || sub.paymentStatus === "pending") {
            color = "amber";
            badge = "Expiring / Pending";
          } else if (sub.status === "EXPIRED" || sub.status === "SUSPENDED" || !isPaid) {
            color = "red";
            badge = "Expired / Unpaid";
          }
        }

        list.push({
          id: c.id,
          lat,
          lng,
          title: `${c.firstName} ${c.lastName}`,
          subtitle: [c.city, c.address].filter(Boolean).join(", "),
          planName: sub?.plan ? `${sub.plan.name} (${sub.plan.speed || ""})` : "No plan",
          phone: c.phone,
          color,
          badge,
          onClickUrl: `/customers/view?id=${encodeURIComponent(c.id)}`,
        });
      }
    });

    return list;
  }, [customers]);

  // Apply visual filter
  const filteredMarkers = React.useMemo(() => {
    if (filter === "paid") return allMarkers.filter((m) => m.color === "green");
    if (filter === "expiring") return allMarkers.filter((m) => m.color === "amber");
    if (filter === "unpaid") return allMarkers.filter((m) => m.color === "red");
    return allMarkers;
  }, [allMarkers, filter]);

  const paidCount = allMarkers.filter((m) => m.color === "green").length;
  const expiringCount = allMarkers.filter((m) => m.color === "amber").length;
  const unpaidCount = allMarkers.filter((m) => m.color === "red").length;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Subscribers Coverage & Payment Map</CardTitle>
              <CardDescription>
                Live geographical map of subscribers with payment & service status
              </CardDescription>
            </div>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilter("all")}
            >
              All ({allMarkers.length})
            </Button>
            <Button
              variant={filter === "paid" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs ${
                filter === "paid" ? "bg-green-600 hover:bg-green-700" : "text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
              }`}
              onClick={() => setFilter("paid")}
            >
              <CheckCircle className="me-1 h-3 w-3" />
              Paid ({paidCount})
            </Button>
            <Button
              variant={filter === "expiring" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs ${
                filter === "expiring" ? "bg-amber-600 hover:bg-amber-700" : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              }`}
              onClick={() => setFilter("expiring")}
            >
              <AlertTriangle className="me-1 h-3 w-3" />
              Expiring ({expiringCount})
            </Button>
            <Button
              variant={filter === "unpaid" ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs ${
                filter === "unpaid" ? "bg-red-600 hover:bg-red-700" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              }`}
              onClick={() => setFilter("unpaid")}
            >
              <XCircle className="me-1 h-3 w-3" />
              Unpaid / Expired ({unpaidCount})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => refetch()}
              title="Refresh Map"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Map View */}
        <InteractiveMap
          markers={filteredMarkers}
          height="440px"
          center={[34.4367, 35.8497]}
        />

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-600 inline-block" />
              <span>Paid & Active</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />
              <span>Expiring Soon / Pending</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 inline-block" />
              <span>Expired / Suspended</span>
            </span>
          </div>
          <span className="text-[11px]">
            Showing {filteredMarkers.length} mapped locations of {customers.length} total subscribers
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
