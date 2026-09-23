"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/status-states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  Wifi,
  Layers,
  Receipt,
} from "lucide-react";
import { getInitials, formatDate, formatCurrency } from "@/lib/utils";

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  whatsappNumber?: string | null;
  avatar?: string | null;
  address?: string | null;
  city?: string | null;
  status: string;
  createdAt: string;
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: string;
    expiryDate: string;
    plan: { name: string; price: number; currency: string; durationDays: number };
  }>;
}

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; sku: string };
}

interface Sale {
  id: string;
  saleNumber: string;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: SaleItem[];
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLocalization();
  const id = params.id as string;

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/customers/${id}`),
  });

  const { data: salesData } = useQuery({
    queryKey: ["customer-sales", id],
    queryFn: () =>
      api.get<{ data: Sale[]; total: number }>("/sales", { customerId: id, limit: 50 }),
    enabled: !!customer?.id,
  });

  const subscriptions = customer?.subscriptions || [];
  const activeSub = subscriptions.find((s) => s.status === "ACTIVE");
  const totalSpent = (salesData?.data || []).reduce((sum, s) => sum + Number(s.totalAmount), 0);

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading customer...</div>;
  }
  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-medium text-destructive">Failed to load customer</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="py-20 text-center">
        <EmptyState message="Customer not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={customer.phone}
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {t("common.back") || "Back"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={customer.avatar || undefined} />
                <AvatarFallback className="text-xl">{getInitials(customer.firstName, customer.lastName)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{customer.firstName} {customer.lastName}</h3>
                <StatusBadge status={customer.status} />
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.whatsappNumber && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    <span>{customer.whatsappNumber}</span>
                  </div>
                )}
                {(customer.address || customer.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{[customer.city, customer.address].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Spent"
              value={formatCurrency(totalSpent)}
              icon={Receipt}
            />
            <StatCard
              title="Active Plan"
              value={activeSub?.plan.name || "—"}
              icon={Wifi}
            />
            <StatCard
              title="Subscriptions"
              value={subscriptions.length}
              icon={Layers}
            />
            <StatCard
              title="Member Since"
              value={formatDate(customer.createdAt)}
              icon={Wifi}
            />
          </div>

          <Tabs defaultValue="subscriptions">
            <TabsList className="flex-wrap">
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
            </TabsList>

            <TabsContent value="subscriptions">
              <Card>
                <CardContent className="pt-6">
                  {subscriptions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No subscriptions yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Expiry</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptions.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium">{sub.plan.name}</TableCell>
                            <TableCell><StatusBadge status={sub.status} /></TableCell>
                            <TableCell>{formatCurrency(Number(sub.plan.price), sub.plan.currency)}</TableCell>
                            <TableCell>{formatDate(sub.startDate)}</TableCell>
                            <TableCell>{formatDate(sub.expiryDate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales">
              <Card>
                <CardContent className="pt-6">
                  {(salesData?.data || []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No sales yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sale #</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(salesData?.data || []).map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono text-sm">{sale.saleNumber}</TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {sale.items.map((i) => i.product.name).join(", ")}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{formatCurrency(Number(sale.totalAmount), sale.currency)}</TableCell>
                            <TableCell className="capitalize">{sale.paymentMethod.replace(/_/g, " ")}</TableCell>
                            <TableCell><Badge variant={sale.status === "COMPLETED" ? "success" : "secondary"}>{sale.status}</Badge></TableCell>
                            <TableCell>{formatDate(sale.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}