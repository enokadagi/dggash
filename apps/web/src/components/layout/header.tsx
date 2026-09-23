"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Search,
  Sun,
  Moon,
  LogOut,
  User,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getInitials } from "@/lib/utils";

function generateBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [];
  let path = "";

  const labelMap: Record<string, string> = {
    dashboard: "Dashboard",
    sales: "Sales",
    pos: "Point of Sale",
    inventory: "Inventory",
    whatsapp: "WhatsApp",
    templates: "Templates",
    messages: "Messages",
    settings: "Settings",
    profile: "Profile",
  };

  segments.forEach((segment, index) => {
    path += `/${segment}`;
    crumbs.push({
      label: labelMap[segment] || segment,
      href: index < segments.length - 1 ? path : undefined,
    });
  });

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const { theme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const breadcrumbs = generateBreadcrumbs(pathname);

  const quickLinks = [
    { label: "Point of Sale", href: "/sales/pos", group: "Sales" },
    { label: "Sales History", href: "/sales", group: "Sales" },
    { label: "Inventory", href: "/inventory", group: "Operations" },
    { label: "WhatsApp Messages", href: "/whatsapp/messages", group: "WhatsApp" },
    { label: "WhatsApp Templates", href: "/whatsapp/templates", group: "WhatsApp" },
    { label: "Settings", href: "/settings/company", group: "System" },
  ];

  const filteredLinks = searchQuery
    ? quickLinks.filter((link) => link.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : quickLinks;

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex-1">
          {breadcrumbs.length > 0 && (
            <Breadcrumb items={breadcrumbs} className="hidden sm:flex" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.avatar} alt={user?.firstName} />
                  <AvatarFallback className="text-xs">
                    {user ? getInitials(user.firstName, user.lastName) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline-flex text-sm font-medium truncate max-w-[100px]">
                  {user?.firstName}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email || user?.phone}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/profile" className="flex items-center gap-2">
                  <User className="h-4 w-4" /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/company" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-destructive">
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput
          placeholder="Search pages..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {filteredLinks.map((link) => (
              <CommandItem
                key={link.href}
                onSelect={() => {
                  router.push(link.href);
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
              >
                {link.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
