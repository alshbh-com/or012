import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { OrderDetailsDialog } from "@/components/order-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  LayoutDashboard, MapPin, Users, Package, Plus, Trash2, Truck, Loader2,
  Map as MapIcon, Eye, KeyRound, Search, Download, Settings as SettingsIcon,
  AlertTriangle, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, statusGroup } from "@/lib/i18n";
import { ComplaintsList } from "@/components/complaints";
import { useNotificationPermission, notify } from "@/lib/notifications";
import { downloadCSV } from "@/lib/export";
import { usePersistedTab } from "@/hooks/use-persisted-tab";

export const Route = createFileRoute("/admin")({ component: AdminPage, ssr: false });

/* navItems built inside AdminContent (state-driven) */

interface City { id: string; name: string; delivery_price: number; is_active: boolean }
interface Restaurant { id: string; name: string; phone: string | null; city_id: string | null; is_active: boolean; user_id: string; address: string | null; location_url: string | null }
interface Driver {
  id: string; phone: string | null; city_id: string | null; is_online: boolean; is_active: boolean; user_id: string;
  current_lat: number | null; current_lng: number | null; vehicle_type: string | null;
}
interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; restaurant_id: string; driver_id: string | null; city_id: string | null;
  created_at: string; assigned_at?: string | null; accepted_at?: string | null; is_closed?: boolean;
}

const STATUSES = ["pending","accepted","preparing","picked_up","on_the_way","on_hold","delivered","cancelled","returned"] as const;

function AdminPage() {
  const { user, loading: authLoading, roles } = useAuth();
  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("admin")) return <Navigate to="/" />;
  return <AdminContent />;
}

function AdminContent() {
  useNotificationPermission();
  const [tab, setTab] = usePersistedTab("admin:tab", "dashboard");
  const [pendingDateFilter, setPendingDateFilter] = useState<string>("");
  useEffect(() => {
    const ch = supabase.channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const o = p.new as { order_number?: string; customer_name?: string };
        toast.info(`طلب جديد: ${o.order_number ?? ""}`);
        notify("طلب جديد", `${o.order_number ?? ""} — ${o.customer_name ?? ""}`);
      }).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  const goOrdersToday = () => {
    setPendingDateFilter(new Date().toISOString().slice(0, 10));
    setTab("orders");
  };

  const navItems: NavItem[] = [
    { label: "اللوحة", icon: LayoutDashboard, onSelect: () => setTab("dashboard") },
    { label: "الطلبات النشطة", icon: Package, onSelect: () => setTab("active") },
    { label: "سلة الطلبات المحذوفة", icon: Trash2, onSelect: () => setTab("old") },
    { label: "بحث الطلبات", icon: Search, onSelect: () => setTab("orders") },
    { label: "حالة المندوبين", icon: Truck, onSelect: () => setTab("drivers-status") },
    { label: "إغلاق وتصفير", icon: SettingsIcon, onSelect: () => setTab("reports") },
    { label: "التتبع على الخريطة", icon: MapIcon, onSelect: () => setTab("map") },
    { label: "المدن", icon: MapPin, onSelect: () => setTab("cities") },
    { label: "المطاعم", icon: Users, onSelect: () => setTab("restaurants") },
    { label: "المندوبين", icon: Truck, onSelect: () => setTab("drivers") },
    { label: "الشكاوى", icon: AlertTriangle, onSelect: () => setTab("complaints") },
    { label: "الإعدادات", icon: SettingsIcon, onSelect: () => setTab("settings") },
  ];

  return (
    <DashboardLayout title="مسؤول" items={navItems}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="dashboard" className="mt-0 space-y-5">
          <DashboardTiles onSelect={setTab} onTodayClick={goOrdersToday} />
          <UnassignedTab />
          <MapTab />
        </TabsContent>
        <TabsContent value="active" className="mt-0"><ActiveOrAssignedTab kind="active" /></TabsContent>
        <TabsContent value="old" className="mt-0"><ActiveOrAssignedTab kind="old" /></TabsContent>
        <TabsContent value="orders" className="mt-0"><OrdersTab initialDate={pendingDateFilter} /></TabsContent>
        <TabsContent value="drivers-status" className="mt-0"><DriversStatusTab /></TabsContent>
        <TabsContent value="reports" className="mt-0"><CloseResetTab /></TabsContent>
        <TabsContent value="map" className="mt-0"><MapTab /></TabsContent>
        <TabsContent value="cities" className="mt-0"><CitiesTab /></TabsContent>
        <TabsContent value="restaurants" className="mt-0"><RestaurantsTab /></TabsContent>
        <TabsContent value="drivers" className="mt-0"><DriversTab /></TabsContent>
        <TabsContent value="complaints" className="mt-0"><ComplaintsList mode="admin" /></TabsContent>
        <TabsContent value="settings" className="mt-0"><SettingsTab /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

function DashboardTiles({ onSelect, onTodayClick }: { onSelect: (tab: string) => void; onTodayClick: () => void }) {
  const [today, setToday] = useState(0);
  const [active, setActive] = useState(0);
  const [online, setOnline] = useState(0);
  const load = async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [{ count: t }, { count: a }, { count: on }] = await Promise.all([
      supabase.from("orders").select("*", { count: "exact", head: true }).gte("created_at", todayStr + "T00:00:00"),
      supabase.from("orders").select("*", { count: "exact", head: true }).in("status", ["pending","accepted","preparing","picked_up","on_the_way","on_hold"]),
      supabase.from("drivers").select("*", { count: "exact", head: true }).eq("is_online", true).eq("is_active", true),
    ]);
    setToday(t ?? 0); setActive(a ?? 0); setOnline(on ?? 0);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-tiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  const tiles = [
    { label: "طلبات اليوم", value: today, cls: "bg-gradient-primary", onClick: onTodayClick },
    { label: "طلبات نشطة", value: active, cls: "bg-gradient-cool", onClick: () => onSelect("active") },
    { label: "متابعة المندوبين", value: online, cls: "bg-gradient-success", onClick: () => onSelect("drivers-status") },
    { label: "بحث الطلبات", value: "🔍", cls: "bg-gradient-warm", onClick: () => onSelect("orders") },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <button key={t.label} onClick={t.onClick} className={`${t.cls} p-4 rounded-xl border-0 shadow-pop text-right text-white`}>
          <div className="text-[10px] uppercase opacity-90">{t.label}</div>
          <div className="mt-1 text-2xl font-extrabold">{t.value}</div>
        </button>
      ))}
    </div>
  );
}


function AdminCountdown({ deadline, label }: { deadline: number; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.floor((deadline - now) / 1000);
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const mm = String(Math.floor(abs / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${overdue ? "bg-destructive/15 text-destructive animate-pulse" : "bg-primary/15 text-primary"}`} dir="ltr">
      {label}: {overdue ? "-" : ""}{mm}:{ss}
    </span>
  );
}

function ActiveOrAssignedTab({ kind }: { kind: "active" | "old" }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [rests, setRests] = useState<Record<string, string>>({});
  const [drvInfo, setDrvInfo] = useState<Record<string, { name: string; phone: string | null }>>({});
  const load = async () => {
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (kind === "active") {
      // Admin sees the active order while EITHER side is still open
      q = q.or("closed_for_restaurant.eq.false,closed_for_driver.eq.false")
        .not("driver_id", "is", null)
        .in("status", ["pending", "accepted", "preparing", "picked_up", "on_the_way", "on_hold"]);
    } else {
      // Trash: always show cancelled/returned, regardless of closed flags
      q = q.in("status", ["cancelled", "returned"]);
    }


    const { data } = await q;
    const list = (data ?? []) as Order[];
    setOrders(list);
    const restIds = Array.from(new Set(list.map((o) => o.restaurant_id)));
    const drvIds = Array.from(new Set(list.map((o) => o.driver_id).filter(Boolean) as string[]));
    if (restIds.length) {
      const { data: rs } = await supabase.from("restaurants").select("id, name").in("id", restIds);
      const m: Record<string, string> = {};
      (rs ?? []).forEach((r) => { m[r.id as string] = r.name as string; });
      setRests(m);
    }
    if (drvIds.length) {
      const { data: ds } = await supabase.from("drivers").select("id, user_id, phone").in("id", drvIds);
      const uids = (ds ?? []).map((d) => d.user_id as string);
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", uids);
      const m: Record<string, { name: string; phone: string | null }> = {};
      (ds ?? []).forEach((d) => {
        const p = profs?.find((pp) => pp.id === d.user_id);
        m[d.id as string] = {
          name: (p?.full_name as string) || (d.phone as string) || (d.id as string).slice(0, 6),
          phone: (d.phone as string) ?? null,
        };
      });
      setDrvInfo(m);
    }
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`admin-${kind}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, [kind]);

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "delivered") updates.delivered_at = new Date().toISOString();
    const { error } = await (supabase.from("orders") as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث");
  };

  return (
    <Card className="p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold neon-text">{kind === "active" ? "الطلبات النشطة" : "سلة الطلبات المحذوفة"}</h2>
        <Badge variant="outline">{orders.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead>
            <TableHead>المطعم</TableHead>
            <TableHead>العنوان</TableHead>
            <TableHead>العميل</TableHead>
            <TableHead>المندوب</TableHead>
            <TableHead>المنتجات</TableHead>
            <TableHead>التوصيل</TableHead>
            <TableHead>الإجمالي</TableHead>
            <TableHead>الحالة</TableHead>
            {kind === "active" && <TableHead>المؤقت</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => {
              const acceptDeadline = o.assigned_at ? new Date(o.assigned_at).getTime() + 2 * 60 * 1000 : null;
              const pickupDeadline = o.accepted_at ? new Date(o.accepted_at).getTime() + 15 * 60 * 1000 : null;
              const info = o.driver_id ? drvInfo[o.driver_id] : null;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-bold">{o.daily_number ?? "—"}</TableCell>
                  <TableCell>{rests[o.restaurant_id] ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] text-xs whitespace-pre-wrap">{o.customer_address}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    {info ? (
                      <div className="flex items-center gap-1.5">
                        <span>{info.name}</span>
                        {info.phone && (
                          <a href={`tel:${info.phone}`} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-success hover:bg-success/25" title="اتصال">
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{Number(o.items_total ?? 0).toFixed(2)}</TableCell>
                  <TableCell>{Number(o.delivery_price).toFixed(2)}</TableCell>
                  <TableCell className="font-bold">{Number(o.total).toFixed(2)}</TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {kind === "active" && (
                    <TableCell>
                      {o.status === "pending" && acceptDeadline && <AdminCountdown deadline={acceptDeadline} label="قبول" />}
                      {o.status === "accepted" && pickupDeadline && <AdminCountdown deadline={pickupDeadline} label="استلام" />}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {orders.length === 0 && <TableRow><TableCell colSpan={kind === "active" ? 10 : 9} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}



async function invokeAdminFn<T = unknown>(name: "admin-create-user" | "admin-manage-user", body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("انتهت الجلسة، سجل الدخول مرة أخرى");
  }

  return supabase.functions.invoke<T>(name, {
    body,
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  });
}

/* Stats removed — now only inside ReportsTab gated by date filter */

function MapTab() {
  const [drivers, setDrivers] = useState<MapDriver[]>([]);
  useEffect(() => {
    const load = async () => {
      const [{ data: ds }, { data: profs }, { data: ords }, { data: rs }] = await Promise.all([
        supabase.from("drivers").select("id, user_id, phone, is_online, is_active, current_lat, current_lng"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("orders").select("driver_id, status, customer_address, restaurant_id, created_at").order("created_at", { ascending: true }),
        supabase.from("restaurants").select("id, name"),
      ]);
      if (!ds) return;
      const nameMap = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));
      const restMap = new Map((rs ?? []).map((r) => [r.id as string, r.name as string]));
      const activeByDriver = new Map<string, number>();
      const ordersByDriver = new Map<string, Array<{ restaurantName: string | null; customerAddress: string | null }>>();
      (ords ?? []).forEach((o) => {
        if (o.driver_id && statusGroup(o.status as string) === "active") {
          const did = o.driver_id as string;
          activeByDriver.set(did, (activeByDriver.get(did) ?? 0) + 1);
          const arr = ordersByDriver.get(did) ?? [];
          arr.push({
            restaurantName: restMap.get(o.restaurant_id as string) ?? null,
            customerAddress: (o.customer_address as string) ?? null,
          });
          ordersByDriver.set(did, arr);
        }
      });
      setDrivers(
        ds.filter((d) => d.current_lat != null && d.current_lng != null && d.is_online && d.is_active).map((d) => {
          const cnt = activeByDriver.get(d.id as string) ?? 0;
          const list = ordersByDriver.get(d.id as string) ?? [];
          return {
            id: d.id as string, lat: Number(d.current_lat), lng: Number(d.current_lng),
            label: nameMap.get(d.user_id as string) || d.phone || (d.id as string).slice(0, 8),
            online: !!d.is_online, hasOrders: cnt > 0, activeCount: cnt,
            restaurantName: list[0]?.restaurantName ?? null,
            customerAddress: list[0]?.customerAddress ?? null,
            activeOrders: list,
          };
        }),
      );
    };
    load();
    const ch = supabase.channel("map-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  const busy = drivers.filter((d) => d.hasOrders).length;
  const free = drivers.filter((d) => d.online && !d.hasOrders).length;
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">تتبع كل المندوبين ({drivers.length})</span>
        <div className="flex gap-3 text-xs">
          <span className="text-accent">📦 مشغول: {busy}</span>
          <span className="text-success">✅ فاضي: {free}</span>
        </div>
      </div>
      <DriversMap drivers={drivers} />
    </Card>
  );
}


function UnassignedTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const load = async () => {
    const [{ data: o }, { data: r }, { data: d }] = await Promise.all([
      supabase.from("orders").select("*").is("driver_id", null).in("status", ["pending", "accepted", "preparing"]).order("created_at", { ascending: false }),
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*").eq("is_active", true),
    ]);
    if (o) setOrders(o as Order[]);
    if (r) setRestaurants(r as Restaurant[]);
    if (d) {
      const ds = d as Driver[];
      setDrivers(ds);
      const uids = ds.map((x) => x.user_id).filter(Boolean);
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", uids);
        const m: Record<string, string> = {};
        ds.forEach((x) => {
          const p = profs?.find((pp) => pp.id === x.user_id);
          m[x.id] = (p?.full_name as string) || x.phone || x.id.slice(0, 6);
        });
        setDriverNames(m);
      }
    }
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("unassigned-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  const assign = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: driverId, assigned_at: new Date().toISOString(), status: "pending" } as never).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم الإسناد — في انتظار قبول المندوب"); load();
  };
  return (
    <Card className="p-5 shadow-soft">
      <div className="mb-3 text-lg font-bold neon-text">طلبات غير معينة ({orders.length})</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>المطعم</TableHead>
            <TableHead>العنوان</TableHead>
            <TableHead>المنتجات</TableHead><TableHead>التوصيل</TableHead><TableHead>الإجمالي</TableHead>
            <TableHead>إسناد لمندوب</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {orders.map((o) => {
              const m = (o.customer_address ?? "").match(/^\s*\(([^)]+)\)\s*([\s\S]*)$/);
              const cityPart = m ? m[1].trim() : null;
              const detailPart = m ? m[2].trim() : (o.customer_address ?? "");
              return (
              <TableRow key={o.id}>
                <TableCell><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-warm px-2 text-xs font-bold text-white">{o.daily_number ?? "—"}</span></TableCell>
                <TableCell>{restaurants.find((r) => r.id === o.restaurant_id)?.name ?? "—"}</TableCell>
                <TableCell className="max-w-[260px] text-xs">
                  {cityPart && <div className="font-bold text-primary">({cityPart})</div>}
                  <div className="whitespace-pre-wrap">{detailPart}</div>
                </TableCell>
                <TableCell>{Number(o.items_total ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-accent">{Number(o.delivery_price ?? 0).toFixed(2)}</TableCell>
                <TableCell className="font-semibold">{Number(o.total).toFixed(2)}</TableCell>
                <TableCell>
                  <Select onValueChange={(v) => assign(o.id, v)}>
                    <SelectTrigger className="w-44 h-8"><SelectValue placeholder="اختر مندوب…" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{driverNames[d.id] ?? d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              );
            })}
            {orders.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">لا توجد طلبات في انتظار الإسناد</TableCell></TableRow>}

          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function DriversStatusTab() {
  interface Row { id: string; name: string; phone: string | null; online: boolean; active: number; delivered: number }
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => {
    const [{ data: ds }, { data: profs }, { data: ords }] = await Promise.all([
      supabase.from("drivers").select("id, user_id, phone, is_online, is_active").eq("is_active", true),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("orders").select("driver_id, status"),
    ]);
    if (!ds) return;
    const nameMap = new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string]));
    const activeBy = new Map<string, number>();
    const doneBy = new Map<string, number>();
    (ords ?? []).forEach((o) => {
      if (!o.driver_id) return;
      const g = statusGroup(o.status as string);
      if (g === "active") activeBy.set(o.driver_id as string, (activeBy.get(o.driver_id as string) ?? 0) + 1);
      if (g === "done") doneBy.set(o.driver_id as string, (doneBy.get(o.driver_id as string) ?? 0) + 1);
    });
    setRows(ds.map((d) => ({
      id: d.id as string,
      name: nameMap.get(d.user_id as string) || d.phone || (d.id as string).slice(0, 8),
      phone: d.phone, online: !!d.is_online,
      active: activeBy.get(d.id as string) ?? 0,
      delivered: doneBy.get(d.id as string) ?? 0,
    })));
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("drivers-status-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);
  return (
    <Card className="p-5 shadow-soft">
      <div className="mb-3 text-lg font-bold neon-text">حالة المندوبين</div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>المندوب</TableHead><TableHead>الهاتف</TableHead>
          <TableHead>الاتصال</TableHead><TableHead>طلبات نشطة</TableHead>
          <TableHead>الحالة</TableHead><TableHead>تم التوصيل</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell dir="ltr">{d.phone ?? "—"}</TableCell>
              <TableCell>
                <Badge className={d.online ? "bg-success/20 text-success border border-success/40" : "bg-muted text-muted-foreground"}>
                  {d.online ? "متصل" : "غير متصل"}
                </Badge>
              </TableCell>
              <TableCell><Badge className="bg-gradient-cool">{d.active}</Badge></TableCell>
              <TableCell>
                {d.active > 0
                  ? <Badge className="bg-accent/20 text-accent border border-accent/40">📦 مشغول</Badge>
                  : <Badge className="bg-success/20 text-success border border-success/40">✅ فاضي</Badge>}
              </TableCell>
              <TableCell className="font-semibold">{d.delivered}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">لا يوجد مندوبين</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}


function CitiesTab() {
  const [cities, setCities] = useState<City[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const load = async () => {
    const { data } = await supabase.from("cities").select("*").order("name");
    if (data) setCities(data as City[]);
  };
  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("cities").insert({ name, delivery_price: Number(price) });
    if (error) return toast.error(error.message);
    setName(""); setPrice(""); toast.success("تمت إضافة المدينة"); load();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("cities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); load();
  };
  const startEdit = (c: City) => { setEditId(c.id); setEditName(c.name); setEditPrice(String(c.delivery_price)); };
  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase.from("cities").update({ name: editName, delivery_price: Number(editPrice) }).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setEditId(null); load();
  };

  return (
    <Card className="p-5">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="اسم المدينة" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="سعر التوصيل" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit"><Plus className="ml-2 h-4 w-4" />إضافة</Button>
      </form>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>سعر التوصيل</TableHead><TableHead className="w-32"></TableHead></TableRow></TableHeader>
        <TableBody>
          {cities.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                {editId === c.id ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} /> : c.name}
              </TableCell>
              <TableCell>
                {editId === c.id ? <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} /> : Number(c.delivery_price).toFixed(2)}
              </TableCell>
              <TableCell className="space-x-reverse space-x-1">
                {editId === c.id ? (
                  <>
                    <Button size="sm" onClick={saveEdit}>حفظ</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>إلغاء</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>تعديل</Button>
                    <Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {cities.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا توجد مدن</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function RestaurantsTab() {
  const [items, setItems] = useState<Restaurant[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [r, c] = await Promise.all([
      supabase.from("restaurants").select("*").order("created_at", { ascending: false }),
      supabase.from("cities").select("*").order("name"),
    ]);
    if (r.data) setItems(r.data as Restaurant[]);
    if (c.data) setCities(c.data as City[]);
  };
  useEffect(() => { load(); }, []);

  return (
    <Card className="p-5">
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مطعم جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء حساب مطعم</DialogTitle></DialogHeader>
            <CreateUserForm role="restaurant" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>المدينة</TableHead><TableHead>الحالة</TableHead><TableHead>أوف لاين</TableHead><TableHead className="w-40">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((r) => {
              const ro = r as Restaurant & { is_offline?: boolean };
              return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell dir="ltr">{r.phone ?? "—"}</TableCell>
                <TableCell>{cities.find((c) => c.id === r.city_id)?.name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={async (v) => {
                        await supabase.from("restaurants").update({ is_active: v }).eq("id", r.id);
                        toast.success(v ? "تم التفعيل" : "تم الإيقاف");
                        load();
                      }}
                    />
                    <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "نشط" : "موقوف"}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!ro.is_offline}
                      onCheckedChange={async (v) => {
                        await (supabase.from("restaurants") as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> } }).update({ is_offline: v }).eq("id", r.id);
                        toast.success(v ? "تم إيقاف الاستلام (المكتب أوف لاين)" : "تم فتح الاستلام");
                        load();
                      }}
                    />
                    <Badge variant={ro.is_offline ? "destructive" : "outline"}>{ro.is_offline ? "أوف لاين" : "متاح"}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <UserActions userId={r.user_id} entity={{ table: "restaurants", id: r.id, label: r.name }} cities={cities} role="restaurant" current={{ name: r.name, phone: r.phone ?? "", city_id: r.city_id, address: r.address, location_url: r.location_url }} onChange={load} />
                </TableCell>
              </TableRow>
              );
            })}
            {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">لا توجد مطاعم</TableCell></TableRow>}

          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function DriversTab() {
  const [items, setItems] = useState<Driver[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [d, c] = await Promise.all([
      supabase.from("drivers").select("*").order("created_at", { ascending: false }),
      supabase.from("cities").select("*").order("name"),
    ]);
    if (d.data) setItems(d.data as Driver[]);
    if (c.data) setCities(c.data as City[]);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("admin-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  return (
    <Card className="p-5">
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مندوب جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء حساب مندوب</DialogTitle></DialogHeader>
            <CreateUserForm role="driver" cities={cities} onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>الهاتف</TableHead><TableHead>الاتصال</TableHead><TableHead>الموقع</TableHead><TableHead>الحالة</TableHead><TableHead className="w-40">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell dir="ltr">{d.phone ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex h-2 w-2 rounded-full ${d.is_online ? "bg-success" : "bg-muted-foreground/40"}`} />
                  <span className="mr-2 text-xs text-muted-foreground">{d.is_online ? "متصل" : "غير متصل"}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground" dir="ltr">
                  {d.current_lat && d.current_lng ? `${d.current_lat.toFixed(4)}, ${d.current_lng.toFixed(4)}` : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={d.is_active}
                      onCheckedChange={async (v) => {
                        await supabase.from("drivers").update({ is_active: v }).eq("id", d.id);
                        toast.success(v ? "تم التفعيل" : "تم الإيقاف"); load();
                      }}
                    />
                    <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "نشط" : "موقوف"}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <UserActions userId={d.user_id} entity={{ table: "drivers", id: d.id, label: d.phone ?? d.id }} cities={cities} role="driver" current={{ name: "", phone: d.phone ?? "", city_id: d.city_id, address: null, location_url: null }} onChange={load} />
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">لا يوجد مندوبين</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function UserActions({ userId, entity, cities, role, current, onChange }: {
  userId: string;
  entity: { table: "restaurants" | "drivers"; id: string; label: string };
  cities: City[];
  role: "restaurant" | "driver";
  current: { name: string; phone: string; city_id: string | null; address: string | null; location_url: string | null };
  onChange: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState(current.name);
  const [phone, setPhone] = useState(current.phone);
  const [cityId, setCityId] = useState(current.city_id ?? "");
  const [address, setAddress] = useState(current.address ?? "");
  const [locationUrl, setLocationUrl] = useState(current.location_url ?? "");

  const resetPassword = async () => {
    const { data, error } = await invokeAdminFn("admin-manage-user", { action: "reset_password", user_id: userId, password: pwd });
    if (error || (data as { error?: string })?.error) return toast.error((data as { error?: string })?.error ?? error?.message ?? "فشل");
    toast.success("تم تغيير كلمة المرور"); setPwd(""); setResetOpen(false);
  };

  const saveEdit = async () => {
    const updates: Record<string, unknown> = role === "restaurant"
      ? { name, phone, city_id: cityId || null, address, location_url: locationUrl || null }
      : { phone, city_id: cityId || null };
    const { error } = await (supabase.from(entity.table) as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", entity.id);
    if (error) return toast.error(error.message);
    if (phone !== current.phone) {
      await invokeAdminFn("admin-manage-user", { action: "update_phone", user_id: userId, phone });
    }
    toast.success("تم الحفظ"); setEditOpen(false); onChange();
  };

  const remove = async () => {
    const { data, error } = await invokeAdminFn("admin-manage-user", { action: "delete", user_id: userId });
    if (error || (data as { error?: string })?.error) return toast.error((data as { error?: string })?.error ?? error?.message ?? "فشل");
    toast.success("تم الحذف"); onChange();
  };

  return (
    <div className="flex items-center gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild><Button variant="ghost" size="sm">تعديل</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل {role === "restaurant" ? "المطعم" : "المندوب"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {role === "restaurant" && (
              <div className="space-y-1.5"><Label>اسم المطعم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            )}
            <div className="space-y-1.5"><Label>الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" /></div>
            <div className="space-y-1.5">
              <Label>المدينة</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {role === "restaurant" && (
              <>
                <div className="space-y-1.5"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>رابط الموقع (Google Maps)</Label><Input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." dir="ltr" /></div>
              </>
            )}
          </div>
          <DialogFooter><Button onClick={saveEdit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogTrigger asChild><Button variant="ghost" size="icon" title="تغيير كلمة المرور"><KeyRound className="h-4 w-4" /></Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>كلمة مرور جديدة</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>كلمة المرور</Label>
            <Input type="password" minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} dir="ltr" />
          </div>
          <DialogFooter><Button onClick={resetPassword} disabled={pwd.length < 6}>تأكيد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نهائي؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الحساب نهائياً ({entity.label}). لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrdersTab({ initialDate = "" }: { initialDate?: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [restaurantFilter, setRestaurantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  useEffect(() => { if (initialDate) { setFrom(initialDate); setTo(initialDate); } }, [initialDate]);

  
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };
  useEffect(() => {
    load();
    Promise.all([
      supabase.from("restaurants").select("*"),
      supabase.from("drivers").select("*"),
    ]).then(async ([r, d]) => {
      if (r.data) setRestaurants(r.data as Restaurant[]);
      if (d.data) {
        const ds = d.data as Driver[];
        setDrivers(ds);
        const ids = ds.map((x) => x.user_id).filter(Boolean);
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          const map: Record<string, string> = {};
          ds.forEach((x) => {
            const p = profs?.find((pp) => pp.id === x.user_id);
            map[x.id] = p?.full_name || x.phone || x.id.slice(0, 6);
          });
          setDriverNames(map);
        }
      }
    });
    const ch = supabase.channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { ch.unsubscribe(); };
  }, []);

  const assignDriver = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from("orders").update({ driver_id: driverId, assigned_at: new Date().toISOString(), status: "pending" } as never).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم التعيين — في انتظار قبول المندوب");
  };

  const updateStatus = async (orderId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "delivered") updates.delivered_at = new Date().toISOString();
    const { error } = await (supabase.from("orders") as unknown as { update: (u: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(updates).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث الحالة");
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      // Hide orders that are closed from both sides AND moved to trash (cancelled/returned)
      const oo = o as Order & { closed_for_restaurant?: boolean; closed_for_driver?: boolean };
      if (oo.closed_for_restaurant && oo.closed_for_driver && (o.status === "cancelled" || o.status === "returned")) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (restaurantFilter !== "all" && o.restaurant_id !== restaurantFilter) return false;
      if (from && new Date(o.created_at) < new Date(from)) return false;
      if (to && new Date(o.created_at) > new Date(to + "T23:59:59")) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!o.order_number.toLowerCase().includes(s) && !o.customer_name.toLowerCase().includes(s) && !o.customer_phone.includes(s)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, restaurantFilter, search, from, to]);

  const exportCsv = () => {
    const rows = filtered.map((o) => ({
      رقم: o.order_number,
      العميل: o.customer_name,
      الهاتف: o.customer_phone,
      العنوان: o.customer_address,
      المطعم: restaurants.find((r) => r.id === o.restaurant_id)?.name ?? "",
      المندوب: drivers.find((d) => d.id === o.driver_id)?.phone ?? "",
      المنتجات: Number(o.items_total).toFixed(2),
      التوصيل: Number(o.delivery_price).toFixed(2),
      الإجمالي: Number(o.total).toFixed(2),
      الحالة: STATUS_AR[o.status] ?? o.status,
      التاريخ: new Date(o.created_at).toLocaleString(),
    }));
    downloadCSV(`orders-${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  return (
    <Card className="p-5">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px_140px_140px_auto]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو الاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المطاعم</SelectItem>
            {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <Button variant="outline" onClick={exportCsv}><Download className="ml-2 h-4 w-4" />CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>المطعم</TableHead>
            <TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>المندوب</TableHead><TableHead className="w-12"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const rest = restaurants.find((r) => r.id === o.restaurant_id);
              return (
                <TableRow key={o.id}>
                  <TableCell><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-primary px-2 text-xs font-bold text-primary-foreground">{o.daily_number ?? "—"}</span></TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                  </TableCell>
                  <TableCell>{rest?.name ?? "—"}</TableCell>
                  <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Select value={o.driver_id ?? ""} onValueChange={(v) => assignDriver(o.id, v)}>
                        <SelectTrigger className="w-40 h-8"><SelectValue placeholder="تعيين…" /></SelectTrigger>
                        <SelectContent>
                          {drivers.filter((d) => d.is_active).map((d) =>
                            <SelectItem key={d.id} value={d.id}>{driverNames[d.id] ?? d.phone ?? d.id.slice(0, 8)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {o.driver_id && drivers.find((d) => d.id === o.driver_id)?.phone && (
                        <a href={`tel:${drivers.find((d) => d.id === o.driver_id)?.phone}`} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-success hover:bg-success/25" title="اتصال">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetailsId(o.id)}><Eye className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <OrderDetailsDialog orderId={detailsId} open={!!detailsId} onOpenChange={(v) => !v && setDetailsId(null)} />
      <div className="mt-3 text-xs text-muted-foreground">{filtered.length} من {orders.length}</div>
    </Card>
  );
}

function CloseResetTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [cities, setCities] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: ds }, { data: cs }] = await Promise.all([
        supabase.from("restaurants").select("*"),
        supabase.from("drivers").select("*"),
        supabase.from("cities").select("id, name"),
      ]);
      if (rs) setRestaurants(rs as Restaurant[]);
      if (cs) {
        const m: Record<string, string> = {};
        cs.forEach((c) => { m[c.id as string] = c.name as string; });
        setCities(m);
      }
      if (ds) {
        const arr = ds as Driver[];
        setDrivers(arr);
        const uids = arr.map((d) => d.user_id).filter(Boolean);
        if (uids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", uids);
          const m: Record<string, string> = {};
          arr.forEach((d) => {
            const p = profs?.find((pp) => pp.id === d.user_id);
            m[d.id] = (p?.full_name as string) || d.phone || d.id.slice(0, 6);
          });
          setDriverNames(m);
        }
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-5 shadow-soft">
        <div className="text-lg font-bold neon-text mb-1">إغلاق وتصفير الحسابات</div>
        <p className="text-xs text-muted-foreground">اختر مطعمًا أو مندوبًا وفترة زمنية، استعرض الإجمالي، ثم نزّل الشيت وقم بالتصفير. تختفي الطلبات عند الطرف المعني وتبقى عند المسؤول.</p>
      </Card>

      <ResetPanel
        kind="restaurant"
        title="تصفير المطاعم"
        items={restaurants.map((r) => ({ id: r.id, name: r.name }))}
        defaultFrom={monthAgo}
        defaultTo={today}
        cities={cities}
      />

      <ResetPanel
        kind="driver"
        title="تصفير المناديب"
        items={drivers.map((d) => ({ id: d.id, name: driverNames[d.id] ?? d.phone ?? d.id.slice(0, 6) }))}
        defaultFrom={monthAgo}
        defaultTo={today}
        cities={cities}
      />

      <DeleteClosedPanel />
    </div>
  );
}

function ResetPanel({ kind, title, items, defaultFrom, defaultTo, cities }: {
  kind: "restaurant" | "driver";
  title: string;
  items: Array<{ id: string; name: string }>;
  defaultFrom: string; defaultTo: string;
  cities: Record<string, string>;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("commission_rate").eq("id", 1).maybeSingle();
      if (data) setCommissionRate(Number(data.commission_rate ?? 0));
    })();
  }, []);

  const preview = async () => {
    if (!targetId) { toast.error("اختر العنصر أولاً"); return; }
    setLoading(true);
    const col = kind === "restaurant" ? "restaurant_id" : "driver_id";
    const closedCol = kind === "restaurant" ? "closed_for_restaurant" : "closed_for_driver";
    const { data } = await supabase.from("orders").select("*")
      .eq(col, targetId).eq("status", "delivered").eq(closedCol, false)
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Order[]);
    setLoading(false);
  };

  const totalDelivery = rows.reduce((s, r) => s + Number(r.delivery_price ?? 0), 0);
  const officeCommission = kind === "driver" ? totalDelivery * (commissionRate / 100) : 0;
  const itemsTotal = rows.reduce((s, r) => s + Number(r.items_total ?? 0), 0);

  const confirmReset = async () => {
    if (rows.length === 0) { toast.info("لا توجد طلبات للتصفير"); return; }
    const targetName = items.find((i) => i.id === targetId)?.name ?? targetId;
    const csv = rows.map((r) => ({
      رقم_الطلب: r.order_number,
      التاريخ: new Date(r.created_at).toLocaleString(),
      المدينة: cities[r.city_id ?? ""] ?? "—",
      العميل: r.customer_name,
      العنوان: r.customer_address,
      عدد_الطلبات: 1,
      قيمة_المنتجات: Number(r.items_total ?? 0).toFixed(2),
      سعر_التوصيل: Number(r.delivery_price ?? 0).toFixed(2),
      الإجمالي: Number(r.total ?? 0).toFixed(2),
    }));
    downloadCSV(`closing-${kind}-${targetName}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setResetting(true);
    const closedCol = kind === "restaurant" ? "closed_for_restaurant" : "closed_for_driver";
    const closedAtCol = kind === "restaurant" ? "closed_for_restaurant_at" : "closed_for_driver_at";
    const ids = rows.map((r) => r.id);
    const { error } = await (supabase.from("orders") as unknown as { update: (u: Record<string, unknown>) => { in: (c: string, v: string[]) => Promise<{ error: { message: string } | null }> } })
      .update({ [closedCol]: true, [closedAtCol]: new Date().toISOString() }).in("id", ids);
    setResetting(false);
    if (error) return toast.error(error.message);
    toast.success(`تم تصفير ${rows.length} طلب`);
    setRows([]);
  };

  return (
    <Card className="p-5 shadow-soft space-y-3">
      <div className="text-lg font-bold">{title}</div>
      <div className="grid gap-2 md:grid-cols-[1fr_140px_140px_auto]">
        <Select value={targetId} onValueChange={(v) => { setTargetId(v); setRows([]); }}>
          <SelectTrigger><SelectValue placeholder={kind === "restaurant" ? "اختر المطعم" : "اختر المندوب"} /></SelectTrigger>
          <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        <Button onClick={preview} disabled={loading || !targetId}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}عرض</Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Card className="bg-gradient-primary p-3 border-0 text-white"><div className="text-[10px] opacity-90">عدد الأوردرات</div><div className="text-2xl font-extrabold">{rows.length}</div></Card>
            <Card className="bg-gradient-cool p-3 border-0 text-white"><div className="text-[10px] opacity-90">أتعاب التوصيل</div><div className="text-2xl font-extrabold">{totalDelivery.toFixed(2)}</div></Card>
            {kind === "driver" && <Card className="bg-gradient-warm p-3 border-0 text-white"><div className="text-[10px] opacity-90">عمولة المكتب ({commissionRate}%)</div><div className="text-2xl font-extrabold">{officeCommission.toFixed(2)}</div></Card>}
            {kind === "restaurant" && <Card className="bg-gradient-success p-3 border-0 text-white"><div className="text-[10px] opacity-90">قيمة المنتجات</div><div className="text-2xl font-extrabold">{itemsTotal.toFixed(2)}</div></Card>}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={resetting}>
                {resetting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                تنزيل الشيتة وتصفير {rows.length} طلب
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>تأكيد التصفير؟</AlertDialogTitle><AlertDialogDescription>سيتم تنزيل CSV ثم إخفاء الطلبات من {kind === "restaurant" ? "المطعم" : "المندوب"} المختار. تبقى عند المسؤول حتى المسح النهائي.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={confirmReset}>تأكيد</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </Card>
  );
}

function DeleteClosedPanel() {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const refresh = async () => {
    const { count: c } = await supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("closed_for_driver", true).eq("closed_for_restaurant", true);
    setCount(c ?? 0);
  };
  useEffect(() => { refresh(); }, []);
  const move = async () => {
    setLoading(true);
    // Move to "trash" by marking as cancelled (which routes them to سلة الطلبات المحذوفة)
    const { error } = await supabase.from("orders").update({ status: "cancelled" } as never)
      .eq("closed_for_driver", true).eq("closed_for_restaurant", true).eq("status", "delivered");
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم نقل الطلبات المقفلة إلى سلة المحذوفات");
    refresh();
  };
  return (
    <Card className="p-5 shadow-soft space-y-3 border-destructive/40">
      <div className="text-lg font-bold text-destructive">مسح الطلبات المقفلة</div>
      <p className="text-xs text-muted-foreground">عدد الطلبات المقفلة من الطرفين: <span className="font-bold">{count}</span></p>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="destructive" className="w-full" disabled={loading || count === 0}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}نقل إلى سلة المحذوفات</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>نقل الطلبات المقفلة؟</AlertDialogTitle><AlertDialogDescription>سيتم نقلها إلى سلة الطلبات المحذوفة (تظهر في تبويب «سلة الطلبات المحذوفة»).</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={move} className="bg-destructive text-destructive-foreground">تأكيد</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}



function SettingsTab() {
  const [appName, setAppName] = useState("");
  const [currency, setCurrency] = useState("");
  const [commission, setCommission] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setAppName(data.app_name ?? "O&R");
        setCurrency(data.currency ?? "ج.م");
        setCommission(String(data.commission_rate ?? 0));
        setSupportPhone(data.support_phone ?? "");
      }
    })();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("app_settings").update({
      app_name: appName, currency, commission_rate: Number(commission), support_phone: supportPhone,
    }).eq("id", 1);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
  };

  return (
    <div className="space-y-6">
      <Card className="max-w-xl p-6">
        <h3 className="mb-4 text-lg font-bold">إعدادات النظام</h3>
        <form onSubmit={save} className="space-y-4">
          <div><Label>اسم النظام</Label><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></div>
          <div><Label>العملة</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
          <div><Label>نسبة العمولة %</Label><Input type="number" step="0.01" value={commission} onChange={(e) => setCommission(e.target.value)} dir="ltr" /></div>
          <div><Label>هاتف الدعم</Label><Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} dir="ltr" /></div>
          <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
        </form>
      </Card>
      <AdminsManager />
    </div>
  );
}

interface AdminRow { user_id: string; full_name: string; phone: string | null }

function AdminsManager() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [open, setOpen] = useState(false);
  const [resetUid, setResetUid] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const load = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) { setAdmins([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
    setAdmins((profs ?? []).map((p) => ({ user_id: p.id as string, full_name: (p.full_name as string) ?? "", phone: (p.phone as string) ?? null })));
  };
  useEffect(() => { load(); }, []);

  const remove = async (uid: string) => {
    try {
      const { data, error } = await invokeAdminFn("admin-manage-user", { action: "delete", user_id: uid });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم الحذف");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل الحذف"); }
  };

  const resetPassword = async () => {
    if (!resetUid || newPwd.length < 6) return;
    try {
      const { data, error } = await invokeAdminFn("admin-manage-user", { action: "reset_password", user_id: resetUid, password: newPwd });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم تغيير كلمة المرور");
      setResetUid(null); setNewPwd("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "فشل"); }
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">المسؤولون (Admins)</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="ml-1 h-4 w-4" />إضافة مسؤول</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مسؤول جديد</DialogTitle></DialogHeader>
            <CreateAdminForm onDone={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead className="text-left">إجراءات</TableHead></TableRow></TableHeader>
        <TableBody>
          {admins.map((a) => (
            <TableRow key={a.user_id}>
              <TableCell className="font-medium">{a.full_name || "—"}</TableCell>
              <TableCell dir="ltr">{a.phone ?? "—"}</TableCell>
              <TableCell className="text-left">
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setResetUid(a.user_id); setNewPwd(""); }} title="تغيير كلمة المرور">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  {a.user_id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>حذف المسؤول؟</AlertDialogTitle>
                          <AlertDialogDescription>سيتم حذف الحساب نهائياً ولا يمكن التراجع.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(a.user_id)}>حذف</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {admins.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">لا يوجد مسؤولون</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={!!resetUid} onOpenChange={(o) => { if (!o) { setResetUid(null); setNewPwd(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>كلمة المرور الجديدة</Label>
            <Input type="password" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} dir="ltr" />
            <DialogFooter><Button onClick={resetPassword} disabled={newPwd.length < 6}>حفظ</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateAdminForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await invokeAdminFn("admin-create-user", {
        phone, password, full_name: name, role: "admin",
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("تم إنشاء المسؤول");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشلت العملية");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" required /></div>
      <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}

function CreateUserForm({ role, cities, onDone }: { role: "restaurant" | "driver"; cities: City[]; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [loading, setLoading] = useState(false);
  void cities;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await invokeAdminFn("admin-create-user", {
        phone, password, full_name: name, role, name,
        address: role === "restaurant" ? address : null,
        location_url: role === "restaurant" ? (locationUrl || null) : null,
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success(role === "restaurant" ? "تم إنشاء المطعم" : "تم إنشاء المندوب");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشلت العملية");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>{role === "restaurant" ? "اسم المطعم" : "اسم المندوب"}</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xxxxxxxx" dir="ltr" required /></div>
      <div className="space-y-1.5"><Label>كلمة المرور</Label><Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></div>
      {role === "restaurant" && (
        <>
          <div className="space-y-1.5"><Label>عنوان المطعم</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="مثال: شارع المعز - وسط البلد" /></div>
          <div className="space-y-1.5"><Label>رابط الموقع (Google Maps)</Label><Input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." dir="ltr" /></div>
        </>
      )}
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء</Button>
      </DialogFooter>
    </form>
  );
}
