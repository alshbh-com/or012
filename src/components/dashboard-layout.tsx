import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

export interface NavItem {
  to?: string;
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
}

interface Props {
  title: string;
  items: NavItem[];
  children: ReactNode;
  showBell?: boolean;
}

const ROLE_AR: Record<string, string> = { admin: "مسؤول", restaurant: "مطعم", driver: "مندوب" };

export function DashboardLayout({ title, items, children, showBell = true }: Props) {
  const { user, signOut, roles } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => { await signOut(); navigate({ to: "/login" }); };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="القائمة"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 bg-sidebar text-sidebar-foreground border-l border-sidebar-border">
              <SheetHeader className="border-b border-sidebar-border p-4">
                <SheetTitle className="flex items-center gap-2 text-right">
                  <img src="/logo.jpg" alt="إنجزني" className="h-9 w-9 rounded-lg object-cover shadow-pop" />
                  <span className="neon-text">إنجزني دليفري · {title}</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-3">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = item.to ? pathname === item.to : false;
                  const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-right transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                  }`;
                  if (item.onSelect) {
                    return (
                      <button key={item.label} className={cls} onClick={() => { item.onSelect!(); setOpen(false); }}>
                        <Icon className="h-4 w-4" /> {item.label}
                      </button>
                    );
                  }
                  return (
                    <Link key={item.to} to={item.to!} className={cls} onClick={() => setOpen(false)}>
                      <Icon className="h-4 w-4" /> {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-auto border-t border-sidebar-border p-3">
                <div className="mb-2 truncate px-2 text-xs text-muted-foreground" dir="ltr">{user?.email}</div>
                <div className="mb-2 flex flex-wrap gap-1 px-2">
                  {roles.map((r) => (
                    <span key={r} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">{ROLE_AR[r] ?? r}</span>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
                  <LogOut className="ml-2 h-4 w-4" /> تسجيل الخروج
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-gradient-primary text-primary-foreground text-xs font-extrabold shadow-pop">R&amp;O</span>
          <span className="font-semibold neon-text">R&amp;O</span>
          <span className="text-xs text-muted-foreground">· {title}</span>
        </div>
        <div className="flex items-center gap-1">
          {showBell && <NotificationBell />}
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="تسجيل الخروج"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
