"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useLocalization } from "@/hooks/use-localization";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCompanyProfile } from "@/hooks/api/use-company-settings";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  MessageCircle,
  Package,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  MessageSquare,
  ShoppingCart,
  Users,
  BellRing,
  Layers,
  CalendarClock,
  ChartColumn,
  Settings,
  History,
  PlugZap,
  UserCog,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { getInitials } from "@/lib/utils";

interface NavItem {
  labelKey: string;
  href?: string;
  icon: React.ElementType;
  /** Hidden from non-admin (STAFF) users. */
  adminOnly?: boolean;
  children?: NavItem[];
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    labelKey: "nav.main",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.sales",
    items: [
      { labelKey: "nav.pos", href: "/sales/pos", icon: ShoppingCart },
      { labelKey: "nav.salesHistory", href: "/sales", icon: Receipt, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.customers",
    items: [
      { labelKey: "nav.customers", href: "/customers", icon: Users },
    ],
  },
  {
    labelKey: "nav.billing",
    items: [
      { labelKey: "nav.plans", href: "/plans", icon: Layers, adminOnly: true },
      { labelKey: "nav.subscriptions", href: "/subscriptions", icon: CalendarClock, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.operations",
    items: [
      { labelKey: "nav.inventory", href: "/inventory", icon: Package, adminOnly: true },
      { labelKey: "nav.stockMovements", href: "/inventory/movements", icon: History, adminOnly: true },
      { labelKey: "nav.expenses", href: "/expenses", icon: Wallet, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.reports",
    items: [
      {
        labelKey: "nav.reports",
        icon: ChartColumn,
        adminOnly: true,
        children: [
          { labelKey: "nav.revenue", href: "/reports/revenue", icon: ChartColumn, adminOnly: true },
          { labelKey: "nav.profit", href: "/reports/profit", icon: TrendingUp, adminOnly: true },
          { labelKey: "nav.customersReport", href: "/reports/customers", icon: Users, adminOnly: true },
          { labelKey: "nav.inventoryReport", href: "/reports/inventory", icon: Package, adminOnly: true },
        ],
      },
    ],
  },
  {
    labelKey: "nav.whatsapp",
    items: [
      { labelKey: "nav.connectionSetup", href: "/whatsapp/connect", icon: PlugZap, adminOnly: true },
      { labelKey: "nav.templates", href: "/whatsapp/templates", icon: MessageSquare, adminOnly: true },
      { labelKey: "nav.messages", href: "/whatsapp/messages", icon: MessageCircle, adminOnly: true },
      { labelKey: "nav.expiryNotifications", href: "/whatsapp/reminders", icon: BellRing, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.employees",
    items: [
      { labelKey: "nav.employees", href: "/employees", icon: UserCog, adminOnly: true },
    ],
  },
  {
    labelKey: "nav.settings",
    items: [
      { labelKey: "nav.settings", href: "/settings", icon: Settings, adminOnly: true },
    ],
  },
];

function filterNavigation(groups: NavGroup[], isAdmin: boolean): NavGroup[] {
  if (isAdmin) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.adminOnly)
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => !child.adminOnly) }
            : item
        )
        .filter((item) => !item.children || item.children.length > 0),
    }))
    .filter((group) => group.items.length > 0);
}

interface SidebarNavProps {
  collapsed?: boolean;
  isAdmin: boolean;
}

function SidebarNav({ collapsed, isAdmin }: SidebarNavProps) {
  const pathname = usePathname();
  const { t } = useLocalization();
  const groups = React.useMemo(() => filterNavigation(navigation, isAdmin), [isAdmin]);

  /**
   * Matches a nav href against the current path on segment boundaries so
   * `/sales` does not stay highlighted while on `/sales-archive`, and a parent
   * link stays active for its nested routes (`/customers/123`).
   */
  const isActive = (href: string) => {
    const target = href.split("?")[0].replace(/\/+$/, "") || "/";
    if (target === "/") return pathname === "/";
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const [openItems, setOpenItems] = React.useState<string[]>(() => {
    const activeGroup = groups.find((group) =>
      group.items.some((item) => item.children?.some((child) => child.href && isActive(child.href)))
    );
    return activeGroup ? [activeGroup.labelKey] : [];
  });

  const toggleGroup = (labelKey: string) => {
    setOpenItems((prev) =>
      prev.includes(labelKey) ? prev.filter((l) => l !== labelKey) : [...prev, labelKey]
    );
  };

  return (
    <nav className="space-y-6 px-2 py-4">
      {groups.map((group) => (
        <div key={group.labelKey}>
          {!collapsed && (
            <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(group.labelKey)}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              if (item.children) {
                const isGroupOpen = openItems.includes(group.labelKey);
                const hasActiveChild = item.children.some((child) => child.href && isActive(child.href));
                return (
                  <Collapsible
                    key={item.labelKey}
                    open={isGroupOpen}
                    onOpenChange={() => toggleGroup(group.labelKey)}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          hasActiveChild && "text-sidebar-accent-foreground",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-start">{t(item.labelKey)}</span>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-transform rtl:rotate-180",
                                isGroupOpen && "rotate-90 rtl:rotate-90"
                              )}
                            />
                          </>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    {!collapsed && (
                      <CollapsibleContent className="ps-7 mt-1 space-y-1">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href!}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              isActive(child.href!) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            )}
                          >
                            <child.icon className="h-3.5 w-3.5" />
                            <span>{t(child.labelKey)}</span>
                          </Link>
                        ))}
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive(item.href!) && "bg-sidebar-accent text-sidebar-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  const { t } = useLocalization();
  const { data: company } = useCompanyProfile();
  const logo = company?.logo;

  return (
    <div
      className={cn(
        "flex h-16 items-center gap-2 border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-4"
      )}
    >
      {logo ? (
        <img
          src={logo}
          alt={company?.name || t("common.appName")}
          className="h-8 w-8 shrink-0 rounded-lg object-contain"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          AW
        </div>
      )}
      {!collapsed && (
        <span className="truncate text-lg font-bold text-sidebar-foreground">
          {company?.name || t("common.appName")}
        </span>
      )}
    </div>
  );
}

function SidebarUser({ user }: { user: NonNullable<ReturnType<typeof useAuthStore.getState>["user"]> }) {
  const { t } = useLocalization();
  const roleLabel = user.role === "ADMIN" ? t("employees.admin") : t("employees.staff");
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.avatar} alt={user.firstName} />
        <AvatarFallback className="text-xs">
          {getInitials(user.firstName, user.lastName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sidebar-foreground truncate">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse } = useUIStore();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { t } = useLocalization();
  const isAdmin = user?.role === "ADMIN";

  if (isMobile) {
    return (
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 rtl:left-auto rtl:right-0">
          <SheetTitle className="sr-only">{t("common.appName")}</SheetTitle>
          <div className="flex h-full flex-col bg-sidebar">
            <SidebarBrand />
            <ScrollArea className="flex-1">
              <SidebarNav isAdmin={isAdmin} />
            </ScrollArea>
            {user && (
              <div className="border-t border-sidebar-border p-4">
                <SidebarUser user={user} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "relative hidden h-screen border-e border-sidebar-border bg-sidebar transition-all duration-300 md:flex md:flex-col",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarBrand collapsed={sidebarCollapsed} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute -end-3 top-20 z-10 hidden h-6 w-6 rounded-full border bg-background shadow-md md:flex"
          onClick={toggleSidebarCollapse}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
        </Button>
        <ScrollArea className="flex-1">
          <SidebarNav collapsed={sidebarCollapsed} isAdmin={isAdmin} />
        </ScrollArea>
        {user && !sidebarCollapsed && (
          <div className="border-t border-sidebar-border p-4">
            <SidebarUser user={user} />
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
