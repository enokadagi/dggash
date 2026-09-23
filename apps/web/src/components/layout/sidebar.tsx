"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { useLocalization } from "@/hooks/use-localization";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
} from "lucide-react";
import { getInitials } from "@/lib/utils";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Point of Sale", href: "/sales/pos", icon: ShoppingCart },
      { label: "Sales History", href: "/sales", icon: Receipt },
    ],
  },
  {
    label: "Customers",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Plans", href: "/plans", icon: Layers },
      { label: "Subscriptions", href: "/subscriptions", icon: CalendarClock },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Stock Movements", href: "/inventory/movements", icon: History },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Reports",
        icon: ChartColumn,
        children: [
          { label: "Revenue", href: "/reports/revenue", icon: ChartColumn },
          { label: "Customers", href: "/reports/customers", icon: Users },
          { label: "Inventory", href: "/reports/inventory", icon: Package },
        ],
      },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { label: "Templates", href: "/whatsapp/templates", icon: MessageSquare },
      { label: "Messages", href: "/whatsapp/messages", icon: MessageCircle },
      { label: "Expiry Notifications", href: "/whatsapp/reminders", icon: BellRing },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarNavProps {
  collapsed?: boolean;
}

function SidebarNav({ collapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const [openItems, setOpenItems] = React.useState<string[]>(() => {
    const activeGroup = navigation.find((group) =>
      group.items.some((item) =>
        item.children?.some((child) => child.href && pathname.startsWith(child.href.split("?")[0]))
      )
    );
    return activeGroup ? [activeGroup.label] : [];
  });

  const toggleGroup = (label: string) => {
    setOpenItems((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (href: string) => pathname.startsWith(href.split("?")[0]);

  return (
    <nav className="space-y-6 px-2 py-4">
      {navigation.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              if (item.children) {
                const isGroupOpen = openItems.includes(group.label);
                const hasActiveChild = item.children.some((child) => child.href && isActive(child.href));
                return (
                  <Collapsible
                    key={item.label}
                    open={isGroupOpen}
                    onOpenChange={() => toggleGroup(group.label)}
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
                            <span className="flex-1 text-start">{item.label}</span>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-transform",
                                isGroupOpen && "rotate-90"
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
                            <span>{child.label}</span>
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
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapse } = useUIStore();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { t } = useLocalization();

  if (isMobile) {
    return (
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col bg-sidebar">
            <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                AW
              </div>
              <span className="text-lg font-bold text-sidebar-foreground">{t("common.appName")}</span>
            </div>
            <ScrollArea className="flex-1">
              <SidebarNav />
            </ScrollArea>
            {user && (
              <div className="border-t border-sidebar-border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                  </div>
                </div>
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
        <div className={cn("flex h-16 items-center gap-2 border-b border-sidebar-border", sidebarCollapsed ? "justify-center px-2" : "px-4")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            AW
          </div>
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">{t("common.appName")}</span>
          )}
        </div>
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
          <SidebarNav collapsed={sidebarCollapsed} />
        </ScrollArea>
        {user && !sidebarCollapsed && (
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {getInitials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}


