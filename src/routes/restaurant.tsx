import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout, type NavItem } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, Plus, Truck, Loader2, UtensilsCrossed, Trash2, X, Package, BarChart3, XCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { STATUS_AR, STATUS_COLORS, statusGroup } from "@/lib/i18n";
import { useNotificationPermission, notify } from "@/lib/notifications";

const CANCEL_WINDOW_MS = 3 * 60 * 1000;

function CancelOrderButton({ orderId, createdAt, status, onDone }: { orderId: string; createdAt: string; status: string; onDone?: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const isFinal = ["delivered", "cancelled", "returned", "picked_up", "on_the_way"].includes(status);
  if (isFinal) return null;
  const deadline = new Date(createdAt).getTime() + CANCEL_WINDOW_MS;
  const remainMs = deadline - now;
  const expired = remainMs <= 0;
  const mm = String(Math.floor(Math.max(0, remainMs) / 60000)).padStart(2, "0");
  const ss = String(Math.floor((Math.max(0, remainMs) % 60000) / 1000)).padStart(2, "0");
  const cancel = async () => {
    if (expired) return;
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    const { error } = await supabase.from("orders").update({ status: "cancelled" } as never).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success("تم إلغاء الطلب");
    onDone?.();
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled={expired} onClick={cancel}>
        <XCircle className="ml-1 h-3.5 w-3.5" />إلغاء
      </Button>
      <span className={`text-[10px] font-bold ${expired ? "text-muted-foreground" : "text-destructive"}`} dir="ltr">
        {expired ? "انتهى وقت الإلغاء" : `${mm}:${ss}`}
      </span>
    </div>
  );
}


export const Route = createFileRoute("/restaurant")({
  component: RestaurantPage,
  ssr: false,
});

interface City { id: string; name: string; delivery_price: number }
interface Product { id: string; name: string; price: number; is_active: boolean }
interface Order {
  id: string; order_number: string; daily_number: number | null; customer_name: string; customer_phone: string;
  customer_address: string; items_total: number; delivery_price: number; total: number;
  status: string; driver_id: string | null; created_at: string; notes: string | null; city_id: string | null;
  restaurant_id?: string; closed_for_restaurant?: boolean;
}

function RestaurantPage() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Truck className="h-8 w-8 animate-pulse text-primary" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes("restaurant")) return <Navigate to="/" />;
  return <Body />;
}

function Body() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [driverInfo, setDriverInfo] = useState<Record<string, { name: string; phone: string | null; user_id: string }>>({});
  const [activeTab, setActiveTab] = useState("dashboard");
  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("");

  useNotificationPermission();

  const loadOrders = async (rid: string) => {
    const { data } = await supabase.from("orders").select("*").eq("restaurant_id", rid).eq("closed_for_restaurant", false).order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };


  const loadProducts = async (rid: string) => {
    const { data } = await supabase.from("products").select("*").eq("restaurant_id", rid).order("name");
    if (data) setProducts(data as Product[]);
  };

  const loadDrivers = async () => {
    const { data } = await supabase.from("drivers").select("id, user_id, phone");
    if (!data) return;
    const userIds = data.map((d) => d.user_id).filter(Boolean) as string[];
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    const nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name as string]));
    const info: Record<string, { name: string; phone: string | null; user_id: string }> = {};
    data.forEach((d) => {
      info[d.id] = { name: nameMap.get(d.user_id) || d.phone || "مندوب", phone: d.phone, user_id: d.user_id };
    });
    setDriverInfo(info);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from("restaurants").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) return;
      setRestaurantId(r.id);
      loadOrders(r.id);
      loadProducts(r.id);
      const { data: c } = await supabase.from("cities").select("*").order("name");
      if (c) setCities(c);
      loadDrivers();
    })();
  }, [user]);

  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase.channel(`rest-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (p) => {
          loadOrders(restaurantId);
          if (p.eventType === "UPDATE") {
            const o = p.new as { order_number?: string; status?: string };
            if (o.status) notify("تحديث طلب", `${o.order_number}: ${STATUS_AR[o.status] ?? o.status}`);
          }
        }).subscribe();
    return () => { ch.unsubscribe(); };
  }, [restaurantId]);

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterCity !== "all" && o.city_id !== filterCity) return false;
    if (filterDate && new Date(o.created_at).toISOString().slice(0, 10) !== filterDate) return false;
    return true;
  });

  const totals = {
    today: orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length,
    active: orders.filter((o) => !["delivered","cancelled","returned"].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  const navItems: NavItem[] = [
    { label: "اللوحة", icon: LayoutDashboard, onSelect: () => setActiveTab("dashboard") },
    { label: "الطلبات", icon: Package, onSelect: () => setActiveTab("orders") },
    { label: "التقارير", icon: BarChart3, onSelect: () => setActiveTab("reports") },
    { label: "القائمة (المنتجات)", icon: UtensilsCrossed, onSelect: () => setActiveTab("products") },
  ];

  if (!restaurantId) {
    return (
      <DashboardLayout title="مطعم" items={[]} showBell={false}>
        <Card className="p-8 text-center text-sm text-muted-foreground">لم يتم إعداد ملف المطعم بعد. يرجى التواصل مع المسؤول.</Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="مطعم" items={navItems} showBell={false}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="dashboard" className="mt-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-warm p-5 shadow-pop">
            <div>
              <h1 className="text-2xl font-extrabold">لوحة المطعم</h1>
              <p className="mt-1 text-xs opacity-90">إدارة طلباتك بسهولة.</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-pop"><Plus className="ml-2 h-5 w-5" />طلب جديد</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>إنشاء طلب جديد</DialogTitle></DialogHeader>
                <NewOrderForm restaurantId={restaurantId} cities={cities} products={products} onDone={() => { setOpen(false); loadOrders(restaurantId); }} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <button onClick={() => setActiveTab("orders")} className="text-right bg-gradient-cool p-4 rounded-xl border-0 shadow-pop text-white"><div className="text-[10px] uppercase opacity-90">نشطة الآن</div><div className="text-2xl font-extrabold">{totals.active}</div></button>
            <Card className="bg-gradient-primary p-4 border-0 shadow-pop text-white"><div className="text-[10px] uppercase opacity-90">طلبات اليوم</div><div className="text-2xl font-extrabold">{totals.today}</div></Card>
            <Card className="bg-gradient-success p-4 border-0 shadow-pop text-white"><div className="text-[10px] uppercase opacity-90">تم التوصيل</div><div className="text-2xl font-extrabold">{totals.delivered}</div></Card>
            <Card className="bg-card p-4 shadow-soft"><div className="text-[10px] uppercase text-muted-foreground">إجمالي الطلبات</div><div className="text-2xl font-extrabold neon-text">{orders.length}</div></Card>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold neon-text">الطلبات النشطة</h2>
            <ActiveOrdersTable orders={orders.filter((o) => statusGroup(o.status) === "active")} driverInfo={driverInfo} />
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <RestaurantReports restaurantId={restaurantId} />
        </TabsContent>


        <TabsContent value="orders" className="mt-0 space-y-5">
          {/* Filters */}
          <Card className="p-3 shadow-soft">
            <div className="grid gap-2 sm:grid-cols-4">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.entries(STATUS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCity} onValueChange={setFilterCity}>
                <SelectTrigger><SelectValue placeholder="المدينة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المدن</SelectItem>
                  {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} dir="ltr" />
              <Button variant="outline" onClick={() => { setFilterStatus("all"); setFilterCity("all"); setFilterDate(""); }}>مسح الفلاتر</Button>
            </div>
          </Card>

          <OrdersByStatus orders={filtered} driverInfo={driverInfo} />
        </TabsContent>

        <TabsContent value="products" className="mt-0">
          <ProductsTab restaurantId={restaurantId} products={products} reload={() => loadProducts(restaurantId)} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

type DriverInfoMap = Record<string, { name: string; phone: string | null; user_id: string }>;

function OrdersByStatus({ orders, driverInfo }: { orders: Order[]; driverInfo: DriverInfoMap }) {
  const groups = {
    active: orders.filter((o) => statusGroup(o.status) === "active"),
    done: orders.filter((o) => statusGroup(o.status) === "done"),
    failed: orders.filter((o) => statusGroup(o.status) === "failed"),
  };
  const confirmPreparing = async (id: string) => {
    const { error } = await supabase.from("orders").update({ status: "preparing" } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم تأكيد التحضير");
  };
  const renderTable = (list: Order[], showPreparingBtn: boolean) => (
    <Card className="p-5 overflow-x-auto shadow-soft">
      <Table>
        <TableHeader><TableRow>
          <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>العنوان</TableHead>
          <TableHead>المندوب</TableHead>
          <TableHead>التوصيل</TableHead>
          <TableHead>الإجمالي</TableHead>
          <TableHead>الحالة</TableHead>
          {showPreparingBtn && <TableHead>إجراء</TableHead>}
        </TableRow></TableHeader>
        <TableBody>
          {list.map((o) => {
            const info = o.driver_id ? driverInfo[o.driver_id] : null;
            const canConfirm = showPreparingBtn && (o.status === "pending" || o.status === "accepted");
            return (
              <TableRow key={o.id}>
                <TableCell><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-gradient-primary px-2 text-sm font-bold text-primary-foreground shadow-soft">{o.daily_number ?? "—"}</span></TableCell>
                <TableCell>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate">{o.customer_address}</TableCell>
                <TableCell>
                  {info ? (
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{info.name}</div>
                      {info.phone && (
                        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                          <a href={`tel:${info.phone}`}>اتصال</a>
                        </Button>
                      )}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">— لم يُعيَّن</span>}
                </TableCell>
                <TableCell className="font-semibold text-accent">{Number(o.delivery_price).toFixed(2)}</TableCell>
                <TableCell className="font-semibold">{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge></TableCell>
                {showPreparingBtn && (
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      {canConfirm ? (
                        <Button size="sm" className="bg-gradient-primary shadow-pop h-8" onClick={() => confirmPreparing(o.id)}>
                          تأكيد قيد التحضير
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                      <CancelOrderButton orderId={o.id} createdAt={o.created_at} status={o.status} />
                    </div>
                  </TableCell>
                )}

              </TableRow>
            );
          })}
          {list.length === 0 && <TableRow><TableCell colSpan={showPreparingBtn ? 8 : 7} className="text-center text-sm text-muted-foreground">لا توجد طلبات</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
  return (
    <Tabs defaultValue="active">
      <TabsList className="bg-card p-1 shadow-soft rounded-xl">
        <TabsTrigger value="active">نشطة ({groups.active.length})</TabsTrigger>
        <TabsTrigger value="done">مكتملة ({groups.done.length})</TabsTrigger>
        <TabsTrigger value="failed">ملغاة/مرتجعة ({groups.failed.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="mt-4">{renderTable(groups.active, true)}</TabsContent>
      <TabsContent value="done" className="mt-4">{renderTable(groups.done, false)}</TabsContent>
      <TabsContent value="failed" className="mt-4">{renderTable(groups.failed, false)}</TabsContent>
    </Tabs>
  );
}

function ProductsTab({ restaurantId, products, reload }: { restaurantId: string; products: Product[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("products").insert({ restaurant_id: restaurantId, name, price: Number(price) });
    if (error) return toast.error(error.message);
    setName(""); setPrice(""); toast.success("تمت إضافة المنتج"); reload();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف"); reload();
  };
  return (
    <Card className="p-5 shadow-soft">
      <form onSubmit={add} className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input placeholder="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="السعر" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Button type="submit" className="bg-gradient-primary shadow-pop"><Plus className="ml-2 h-4 w-4" />إضافة</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4 flex items-center justify-between shadow-soft">
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-primary font-bold">{Number(p.price).toFixed(2)}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
        {products.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            لا توجد منتجات بعد. أضف أول منتج لتظهر في الطلبات بسرعة.
          </Card>
        )}
      </div>
    </Card>
  );
}

function NewOrderForm({ restaurantId, cities, products, onDone }: { restaurantId: string; cities: City[]; products: Product[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cityId, setCityId] = useState("");
  const [cart, setCart] = useState<Array<{ name: string; price: number; qty: number }>>([]);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [driverNotes, setDriverNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const city = cities.find((c) => c.id === cityId);
  const deliveryPrice = city?.delivery_price ?? 0;
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemsTotal = cartTotal > 0 ? cartTotal : Number(manualTotal) || 0;
  const total = itemsTotal + Number(deliveryPrice);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.name === p.name);
      if (ex) return prev.map((i) => i === ex ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { name: p.name, price: Number(p.price), qty: 1 }];
    });
  };

  const addCustomProduct = () => {
    if (!productName.trim()) return;
    const price = Number(productPrice) || 0;
    setCart((prev) => [...prev, { name: productName.trim(), price, qty: 1 }]);
    setProductName(""); setProductPrice("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cityId) { toast.error("اختر المدينة"); return; }
    setLoading(true);
    const itemsLine = cart.length > 0 ? cart.map((i) => `${i.name} × ${i.qty}`).join("، ") : "";
    const combined = [itemsLine, driverNotes && `📝 للمندوب: ${driverNotes}`].filter(Boolean).join("\n");
    const cityName = city?.name ?? "";
    const finalAddress = `(${cityName})${address.trim() ? " " + address.trim() : ""}`;
    const { error } = await supabase.from("orders").insert({
      restaurant_id: restaurantId,
      customer_name: name,
      customer_phone: phone,
      customer_address: finalAddress,
      city_id: cityId || null,
      items_total: itemsTotal,
      delivery_price: Number(deliveryPrice),
      notes: combined || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الطلب");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>اسم العميل</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="space-y-1.5"><Label>رقم الهاتف</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" /></div>
      </div>
      <div className="space-y-1.5">
        <Label>المدينة <span className="text-destructive">*</span></Label>
        <Select value={cityId} onValueChange={setCityId}>
          <SelectTrigger><SelectValue placeholder="اختر المدينة (إجباري)" /></SelectTrigger>
          <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {Number(c.delivery_price).toFixed(2)}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">سيتم كتابة اسم المدينة بين قوسين قبل تفاصيل العنوان تلقائياً.</p>
      </div>
      <div className="space-y-1.5"><Label>تفاصيل العنوان (اختياري)</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="مثال: شارع 9 - عمارة 12 - الدور الثالث" /></div>


      {products.length > 0 && (
        <div className="space-y-2">
          <Label>إضافة من القائمة</Label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto rounded-md border p-2">
            {products.map((p) => (
              <Button type="button" key={p.id} variant="outline" size="sm" onClick={() => addProduct(p)}>
                {p.name} <span className="text-xs text-muted-foreground mr-2">({Number(p.price).toFixed(2)})</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-md border p-2">
        <Label className="text-xs">إضافة منتج بالاسم يدوياً</Label>
        <div className="grid grid-cols-[1fr_120px_auto] gap-2">
          <Input placeholder="اسم المنتج" value={productName} onChange={(e) => setProductName(e.target.value)} />
          <Input placeholder="السعر" type="number" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} />
          <Button type="button" variant="outline" onClick={addCustomProduct}>إضافة</Button>
        </div>
      </div>

      {cart.length > 0 && (
        <div className="rounded-md border p-2 space-y-1">
          {cart.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span>{i.name} × {i.qty}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{(i.price * i.qty).toFixed(2)}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((_, j) => j !== idx))}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cart.length === 0 && (
        <div className="space-y-1.5"><Label>قيمة الطلب يدوياً</Label><Input type="number" step="0.01" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} placeholder="إذا لم تستخدم القائمة" /></div>
      )}

      <div className="rounded-md bg-muted p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">قيمة المنتجات</span><span>{itemsTotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">سعر التوصيل</span><span>{Number(deliveryPrice).toFixed(2)}</span></div>
        <div className="flex justify-between font-bold text-lg text-primary border-t pt-1"><span>الإجمالي</span><span>{total.toFixed(2)}</span></div>
      </div>
      <div className="space-y-1.5"><Label>تفاصيل / تعليمات للمندوب</Label><Textarea value={driverNotes} onChange={(e) => setDriverNotes(e.target.value)} placeholder="مثال: الدور الثالث، اطلب بدر قبل الصعود…" /></div>
      <DialogFooter><Button type="submit" disabled={loading || (itemsTotal === 0)} className="bg-gradient-primary shadow-pop">{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء الطلب</Button></DialogFooter>
    </form>
  );
}

function ActiveOrdersTable({ orders, driverInfo }: { orders: Order[]; driverInfo: DriverInfoMap }) {
  if (orders.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">لا توجد طلبات نشطة الآن.</Card>;
  }
  return (
    <Card className="p-5 overflow-x-auto shadow-soft">
      <Table>
        <TableHeader><TableRow>
          <TableHead>#</TableHead><TableHead>العميل</TableHead><TableHead>المندوب</TableHead>
          <TableHead>التوصيل</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead>
          <TableHead>إلغاء</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {orders.map((o) => {
            const info = o.driver_id ? driverInfo[o.driver_id] : null;
            return (
              <TableRow key={o.id}>
                <TableCell><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gradient-primary px-2 text-xs font-bold text-primary-foreground">{o.daily_number ?? "—"}</span></TableCell>
                <TableCell>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{o.customer_phone}</div>
                </TableCell>
                <TableCell>
                  {info ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{info.name}</span>
                      {info.phone && (
                        <Button asChild size="icon" variant="outline" className="h-7 w-7 bg-success/15 text-success border-success/40 hover:bg-success/25">
                          <a href={`tel:${info.phone}`} title="اتصال"><Phone className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">— لم يُعيَّن</span>}
                </TableCell>
                <TableCell className="text-accent">{Number(o.delivery_price).toFixed(2)}</TableCell>
                <TableCell className="font-semibold">{Number(o.total).toFixed(2)}</TableCell>
                <TableCell><Badge className={STATUS_COLORS[o.status]}>{STATUS_AR[o.status] ?? o.status}</Badge></TableCell>
                <TableCell><CancelOrderButton orderId={o.id} createdAt={o.created_at} status={o.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}


function RestaurantReports({ restaurantId }: { restaurantId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const apply = async () => {
    setLoading(true);
    const { data } = await supabase.from("orders").select("*")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Order[]);
    setLoading(false);
  };
  const delivered = rows.filter((o) => o.status === "delivered");
  const items = delivered.reduce((s, o) => s + Number(o.items_total ?? 0), 0);
  const delivery = delivered.reduce((s, o) => s + Number(o.delivery_price ?? 0), 0);
  const total = delivered.reduce((s, o) => s + Number(o.total ?? 0), 0);
  return (
    <div className="space-y-4">
      <Card className="p-5 shadow-soft">
        <div className="mb-3 text-lg font-bold neon-text">تقريري</div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div><Label className="text-xs">من تاريخ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" /></div>
          <div><Label className="text-xs">إلى تاريخ</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" /></div>
          <div className="flex items-end"><Button onClick={apply} disabled={loading} className="bg-gradient-primary shadow-pop">{loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}عرض</Button></div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="bg-gradient-primary p-4 border-0 shadow-pop text-white"><div className="text-xs opacity-90">إجمالي الطلبات</div><div className="text-3xl font-extrabold">{rows.length}</div></Card>
        <Card className="bg-gradient-success p-4 border-0 shadow-pop text-white"><div className="text-xs opacity-90">تم التوصيل</div><div className="text-3xl font-extrabold">{delivered.length}</div></Card>
        <Card className="bg-gradient-warm p-4 border-0 shadow-pop text-white"><div className="text-xs opacity-90">قيمة المنتجات</div><div className="text-3xl font-extrabold">{items.toFixed(2)}</div></Card>
        <Card className="bg-gradient-cool p-4 border-0 shadow-pop text-white"><div className="text-xs opacity-90">الإجمالي الكلي</div><div className="text-3xl font-extrabold">{total.toFixed(2)}</div></Card>
      </div>
      <Card className="p-5 shadow-soft">
        <div className="mb-2 text-sm text-muted-foreground">أتعاب التوصيل في الفترة: <span className="font-bold text-accent">{delivery.toFixed(2)}</span></div>
      </Card>
    </div>
  );
}
