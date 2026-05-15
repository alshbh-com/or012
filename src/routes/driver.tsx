import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, MapPin, Phone, Truck, Map as MapIcon, MessagesSquare, AlertTriangle, Store } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS, statusGroup } from "@/lib/i18n";
import { ChatPanel } from "@/components/chat-panel";
import { ComplaintsList } from "@/components/complaints";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { useNotificationPermission, notify } from "@/lib/notifications";

export const Route = createFileRoute("/driver")({
  component: DriverPage,
});

const navItems: NavItem[] = [{ to: "/driver", label: "طلباتي", icon: LayoutDashboard }];

const NEXT_STATUS: Record<string, string[]> = {
  pending: ["preparing", "picked_up"],
  accepted: ["preparing", "picked_up"],
  preparing: ["picked_up"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered", "returned"],
};

interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; created_at: string; notes: string | null; restaurant_id: string;
}
interface RestaurantInfo { id: string; name: string; address: string | null; phone: string | null }

function DriverPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("driver")) return <Navigate to="/" />;
  return (
    <DashboardLayout title="مندوب" items={navItems}>
      <Body />
    </DashboardLayout>
  );
}

function Body() {
  const { user } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Record<string, RestaurantInfo>>({});
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [knownIds] = useState(new Set<string>());

  useNotificationPermission();

  const loadOrders = async (did: string, isInitial = false) => {
    const { data } = await supabase.from("orders").select("*").eq("driver_id", did).order("created_at", { ascending: false });
    if (!data) return;
    if (!isInitial) {
      data.forEach((o) => {
        if (!knownIds.has(o.id)) {
          toast.info(`طلب جديد: ${o.order_number}`);
          notify("طلب جديد على حسابك", `${o.order_number} — ${o.customer_name}`);
        }
      });
    }
    data.forEach((o) => knownIds.add(o.id));
    setOrders(data as Order[]);

    // Fetch restaurants info
    const restIds = Array.from(new Set(data.map((o) => o.restaurant_id))).filter(Boolean);
    if (restIds.length) {
      const { data: rs } = await supabase.from("restaurants").select("id, name, address, phone").in("id", restIds);
      const map: Record<string, RestaurantInfo> = {};
      (rs ?? []).forEach((r) => { map[r.id as string] = r as RestaurantInfo; });
      setRestaurants(map);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: d } = await supabase.from("drivers").select("id, is_online").eq("user_id", user.id).maybeSingle();
      if (!d) return;
      setDriverId(d.id); setIsOnline(d.is_online);
      await loadOrders(d.id, true);
    })();
  }, [user]);

  useEffect(() => {
    if (!driverId) return;
    const ch = supabase.channel(`driver-orders-${driverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` },
        () => loadOrders(driverId))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` },
        () => loadOrders(driverId))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [driverId]);

  useEffect(() => {
    if (!driverId || !isOnline) return;
    if (!("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        await supabase.from("drivers").update({
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        }).eq("id", driverId);
      },
      (err) => console.warn("geo", err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [driverId, isOnline]);

  const toggleOnline = async (v: boolean) => {
    if (!driverId) return;
    setIsOnline(v);
    await supabase.from("drivers").update({ is_online: v }).eq("id", driverId);
  };

  const updateStatus = async (id: string, status: string) => {
    const patch = status === "delivered"
      ? { status: status as Order["status"], delivered_at: new Date().toISOString() }
      : { status: status as Order["status"] };
    const { error } = await supabase.from("orders").update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`تم التحديث: ${STATUS_AR[status] ?? status}`);
  };

  const grouped = useMemo(() => ({
    active: orders.filter((o) => statusGroup(o.status) === "active"),
    done: orders.filter((o) => statusGroup(o.status) === "done"),
    failed: orders.filter((o) => statusGroup(o.status) === "failed"),
  }), [orders]);

  const totals = {
    active: grouped.active.length,
    delivered: grouped.done.length,
    earnings: grouped.done.reduce((s, o) => s + Number(o.delivery_price), 0),
  };

  if (!driverId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">لم يتم إعداد ملف المندوب بعد. يرجى التواصل مع المسؤول.</Card>;
  }

  const mapDrivers: MapDriver[] = myPos
    ? [{ id: driverId, lat: myPos.lat, lng: myPos.lng, label: "موقعي الحالي", online: isOnline, hasOrders: totals.active > 0, activeCount: totals.active }]
    : [];

  const renderOrders = (list: Order[]) => (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((o) => {
        const next = NEXT_STATUS[o.status] ?? [];
        const r = restaurants[o.restaurant_id];
        const restMaps = r?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}` : null;
        const custMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer_address)}`;
        return (
          <Card key={o.id} className="p-5 shadow-soft neon-border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary text-base font-extrabold text-primary-foreground shadow-pop">{o.daily_number ?? "—"}</span>
                <div>
                  <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{o.order_number}</div>
                </div>
              </div>
              <Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge>
            </div>

            {/* Restaurant section */}
            <div className="mt-3 rounded-lg bg-accent/10 border border-accent/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-accent" />
                <span className="font-bold neon-text-accent">{r?.name ?? "المطعم"}</span>
              </div>
              {r?.address && (
                <a href={restMaps!} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-sm text-accent hover:underline">
                  <MapPin className="h-4 w-4 mt-0.5" /><span>{r.address}</span>
                </a>
              )}
              {r?.phone && (
                <Button asChild size="sm" variant="outline" className="h-7">
                  <a href={`tel:${r.phone}`} dir="ltr"><Phone className="ml-1 h-3 w-3" />اتصال بالمطعم</a>
                </Button>
              )}
            </div>

            {/* Customer section */}
            <div className="mt-3 rounded-lg bg-primary/10 border border-primary/30 p-3 space-y-2">
              <div className="font-bold neon-text">{o.customer_name}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`tel:${o.customer_phone}`} dir="ltr"><Phone className="ml-1 h-3.5 w-3.5" />اتصال</a>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`sms:${o.customer_phone}`} dir="ltr"><MessagesSquare className="ml-1 h-3.5 w-3.5" />SMS</a>
                </Button>
                <span className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</span>
              </div>
              <a href={custMaps} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-sm text-primary hover:underline">
                <MapPin className="h-4 w-4 mt-0.5" /><span>{o.customer_address}</span>
              </a>
            </div>

            {o.notes && (
              <div className="mt-3 rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                <div className="font-semibold mb-1">تفاصيل الطلب:</div>
                {o.notes}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">المبلغ المستحق</span>
              <span className="font-bold neon-text">{Number(o.total).toFixed(2)}</span>
            </div>
            {next.length > 0 && (
              <div className="mt-3">
                <Select onValueChange={(v) => updateStatus(o.id, v)}>
                  <SelectTrigger><SelectValue placeholder="تحديث الحالة…" /></SelectTrigger>
                  <SelectContent>
                    {next.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s] ?? s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>
        );
      })}
      {list.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">لا توجد طلبات في هذه القائمة.</Card>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-cool p-6 shadow-pop">
        <div>
          <h1 className="text-3xl font-extrabold neon-text">طلباتي</h1>
          <p className="mt-1 text-sm opacity-90">{isOnline ? "موقعك يُبث مباشرة للأدمن والمطاعم" : "فعّل الاتصال لبدء استقبال الطلبات"}</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-background/30 backdrop-blur px-4 py-2">
          <span className={`h-3 w-3 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-sm font-semibold">{isOnline ? "متصل" : "غير متصل"}</span>
          <Switch checked={isOnline} onCheckedChange={toggleOnline} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "نشط", value: totals.active, cls: "bg-gradient-primary" },
          { label: "تم التوصيل", value: totals.delivered, cls: "bg-gradient-success" },
          { label: "الأرباح", value: totals.earnings.toFixed(2), cls: "bg-gradient-warm" },
        ].map((c) => (
          <Card key={c.label} className={`${c.cls} p-5 border-0 shadow-pop`}>
            <div className="text-xs uppercase tracking-wider opacity-90">{c.label}</div>
            <div className="mt-2 text-3xl font-extrabold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="bg-card p-1 shadow-soft rounded-xl">
          <TabsTrigger value="orders"><LayoutDashboard className="ml-2 h-4 w-4" />الطلبات</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="ml-2 h-4 w-4" />موقعي</TabsTrigger>
          <TabsTrigger value="complaints"><AlertTriangle className="ml-2 h-4 w-4" />الشكاوى</TabsTrigger>
          <TabsTrigger value="chat"><MessagesSquare className="ml-2 h-4 w-4" />المحادثات</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <Tabs defaultValue="active">
            <TabsList className="bg-card p-1 shadow-soft rounded-xl">
              <TabsTrigger value="active">نشطة ({grouped.active.length})</TabsTrigger>
              <TabsTrigger value="done">مكتملة ({grouped.done.length})</TabsTrigger>
              <TabsTrigger value="failed">ملغاة/مرتجعة ({grouped.failed.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">{renderOrders(grouped.active)}</TabsContent>
            <TabsContent value="done" className="mt-4">{renderOrders(grouped.done)}</TabsContent>
            <TabsContent value="failed" className="mt-4">{renderOrders(grouped.failed)}</TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card className="p-3">
            <div className="mb-2 text-sm text-muted-foreground">
              {isOnline ? "موقعك يُحدَّث تلقائيًا. يراك الأدمن والمطعم على خريطتهم." : "فعّل وضع الاتصال لبدء بث موقعك."}
            </div>
            <DriversMap drivers={mapDrivers} />
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-4">
          <ComplaintsList mode="driver" driverId={driverId} />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ChatPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
