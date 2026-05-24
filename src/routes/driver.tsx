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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, MapPin, Phone, Truck, Map as MapIcon, MessagesSquare, AlertTriangle, Store, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS, statusGroup } from "@/lib/i18n";
import { ChatPanel } from "@/components/chat-panel";
import { ComplaintsList } from "@/components/complaints";
import { DriversMap, type MapDriver } from "@/components/drivers-map";
import { useNotificationPermission, notify } from "@/lib/notifications";

export const Route = createFileRoute("/driver")({ component: DriverPage });

const NEXT_STATUS: Record<string, string[]> = {
  accepted: ["picked_up"],
  preparing: ["picked_up"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered", "returned"],
};

interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; created_at: string; accepted_at: string | null; notes: string | null; restaurant_id: string;
}
interface RestaurantInfo { id: string; name: string; address: string | null; phone: string | null }

function DriverPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("driver")) return <Navigate to="/" />;
  return <Body />;
}

// Simple WhatsApp link normalizer (Egypt-aware)
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "2" + digits : digits;
  return `https://wa.me/${intl}`;
}

function Countdown({ deadline, label }: { deadline: number; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.floor((deadline - now) / 1000);
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const mm = String(Math.floor(abs / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${overdue ? "bg-destructive/15 text-destructive animate-pulse" : "bg-primary/15 text-primary"}`}>
      <span className="opacity-80">{label}:</span>
      <span dir="ltr">{overdue ? "-" : ""}{mm}:{ss}</span>
    </div>
  );
}

function Body() {
  const { user } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [commission, setCommission] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Record<string, RestaurantInfo>>({});
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [tab, setTab] = useState("dashboard");
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
      const { data: d } = await supabase.from("drivers").select("id, is_online, commission_rate").eq("user_id", user.id).maybeSingle();
      if (!d) return;
      setDriverId(d.id); setIsOnline(!!d.is_online);
      setCommission(Number(d.commission_rate ?? 0));
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
          current_lat: pos.coords.latitude, current_lng: pos.coords.longitude,
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

  const acceptOrder = async (id: string) => {
    const { error } = await supabase.from("orders")
      .update({ status: "accepted", accepted_at: new Date().toISOString() } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم قبول الطلب");
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
    earnings: grouped.done.reduce((s, o) => s + Number(o.delivery_price) * (commission / 100), 0),
  };

  const navItems: NavItem[] = [
    { label: "اللوحة", icon: LayoutDashboard, onSelect: () => setTab("dashboard") },
    { label: "موقعي", icon: MapIcon, onSelect: () => setTab("map") },
    { label: "الشكاوى", icon: AlertTriangle, onSelect: () => setTab("complaints") },
    { label: "المحادثات", icon: MessagesSquare, onSelect: () => setTab("chat") },
  ];

  if (!driverId) {
    return (
      <DashboardLayout title="مندوب" items={[]}>
        <Card className="p-8 text-center text-sm text-muted-foreground">لم يتم إعداد ملف المندوب بعد. يرجى التواصل مع المسؤول.</Card>
      </DashboardLayout>
    );
  }

  const mapDrivers: MapDriver[] = myPos
    ? [{ id: driverId, lat: myPos.lat, lng: myPos.lng, label: "موقعي الحالي", online: isOnline, hasOrders: totals.active > 0, activeCount: totals.active }]
    : [];

  const renderOrders = (list: Order[]) => (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((o) => {
        const r = restaurants[o.restaurant_id];
        const restMaps = r?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}` : null;
        const custMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.customer_address)}`;
        const isPending = o.status === "pending";
        // 2 min from order creation (assignment proxy)
        const acceptDeadline = new Date(o.created_at).getTime() + 2 * 60 * 1000;
        // 15 min from accepted_at to pickup
        const pickupDeadline = o.accepted_at ? new Date(o.accepted_at).getTime() + 15 * 60 * 1000 : null;
        const next = NEXT_STATUS[o.status] ?? [];

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

            {/* Timers */}
            <div className="mt-2 flex flex-wrap gap-2">
              {isPending && <Countdown deadline={acceptDeadline} label="للقبول" />}
              {o.status === "accepted" && pickupDeadline && <Countdown deadline={pickupDeadline} label="للاستلام" />}
            </div>

            {/* Restaurant */}
            <div className="mt-3 rounded-lg bg-accent/10 border border-accent/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-accent" />
                <span className="font-bold neon-text-accent">{r?.name ?? "المطعم"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {restMaps && (
                  <Button asChild size="sm" variant="outline" className="h-7">
                    <a href={restMaps} target="_blank" rel="noreferrer"><MapPin className="ml-1 h-3.5 w-3.5" />موقع المطعم</a>
                  </Button>
                )}
                {r?.phone && (
                  <Button asChild size="sm" variant="outline" className="h-7">
                    <a href={`tel:${r.phone}`} dir="ltr"><Phone className="ml-1 h-3 w-3" />اتصال</a>
                  </Button>
                )}
              </div>
              {r?.address && <div className="text-xs text-muted-foreground">{r.address}</div>}
            </div>

            {/* Customer */}
            <div className="mt-3 rounded-lg bg-primary/10 border border-primary/30 p-3 space-y-2">
              <div className="font-bold neon-text">{o.customer_name}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`tel:${o.customer_phone}`} dir="ltr"><Phone className="ml-1 h-3.5 w-3.5" />اتصال</a>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 border-success/50 text-success hover:bg-success/10">
                  <a href={waLink(o.customer_phone)} target="_blank" rel="noreferrer" dir="ltr">
                    <MessagesSquare className="ml-1 h-3.5 w-3.5" />WhatsApp
                  </a>
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

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
              <div className="rounded bg-muted/40 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">سعر التوصيل</div>
                <div className="font-bold text-accent">{Number(o.delivery_price).toFixed(2)}</div>
              </div>
              <div className="rounded bg-muted/40 p-2 text-center">
                <div className="text-[10px] text-muted-foreground">المبلغ المستحق على العميل</div>
                <div className="font-bold neon-text">{Number(o.total).toFixed(2)}</div>
              </div>
            </div>

            {/* Actions */}
            {isPending ? (
              <Button className="mt-3 w-full bg-gradient-primary shadow-pop" onClick={() => acceptOrder(o.id)}>
                <CheckCircle2 className="ml-2 h-4 w-4" /> قبول الطلب
              </Button>
            ) : next.length > 0 ? (
              <div className="mt-3">
                <Select onValueChange={(v) => updateStatus(o.id, v)}>
                  <SelectTrigger><SelectValue placeholder="تحديث الحالة…" /></SelectTrigger>
                  <SelectContent>
                    {next.map((s) => <SelectItem key={s} value={s}>{STATUS_AR[s] ?? s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </Card>
        );
      })}
      {list.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2">لا توجد طلبات في هذه القائمة.</Card>
      )}
    </div>
  );

  return (
    <DashboardLayout title="مندوب" items={navItems}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="dashboard" className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-cool p-5 shadow-pop">
            <div>
              <h1 className="text-2xl font-extrabold neon-text">طلباتي</h1>
              <p className="mt-1 text-xs opacity-90">{isOnline ? "موقعك يُبث مباشرة" : "فعّل الاتصال لبدء استقبال الطلبات"}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-background/30 backdrop-blur px-3 py-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="text-xs font-semibold">{isOnline ? "متصل" : "غير متصل"}</span>
              <Switch checked={isOnline} onCheckedChange={toggleOnline} />
            </div>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Card className="bg-gradient-primary p-4 border-0 shadow-pop">
              <div className="text-[10px] uppercase opacity-90">نشطة</div>
              <div className="text-2xl font-extrabold">{totals.active}</div>
            </Card>
            <Card className="bg-gradient-success p-4 border-0 shadow-pop">
              <div className="text-[10px] uppercase opacity-90">تم التوصيل</div>
              <div className="text-2xl font-extrabold">{totals.delivered}</div>
            </Card>
            <Card className="bg-gradient-warm p-4 border-0 shadow-pop">
              <div className="text-[10px] uppercase opacity-90">عمولتي %</div>
              <div className="text-2xl font-extrabold">{commission}%</div>
            </Card>
            <Card className="bg-gradient-warm p-4 border-0 shadow-pop">
              <div className="text-[10px] uppercase opacity-90">أرباحي</div>
              <div className="text-2xl font-extrabold">{totals.earnings.toFixed(2)}</div>
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold neon-text">الطلبات النشطة</h2>
            {renderOrders(grouped.active)}
          </div>

          {(grouped.done.length > 0 || grouped.failed.length > 0) && (
            <>
              <h2 className="mb-3 mt-6 text-lg font-bold text-muted-foreground">مكتملة ({grouped.done.length})</h2>
              {renderOrders(grouped.done)}
              {grouped.failed.length > 0 && (
                <>
                  <h2 className="mb-3 mt-6 text-lg font-bold text-muted-foreground">ملغاة/مرتجعة ({grouped.failed.length})</h2>
                  {renderOrders(grouped.failed)}
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="map" className="mt-0">
          <Card className="p-3">
            <div className="mb-2 text-sm text-muted-foreground">
              {isOnline ? "موقعك يُحدَّث تلقائيًا." : "فعّل وضع الاتصال لبث موقعك."}
            </div>
            <DriversMap drivers={mapDrivers} />
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-0">
          <ComplaintsList mode="driver" driverId={driverId} />
        </TabsContent>

        <TabsContent value="chat" className="mt-0">
          <ChatPanel />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
