import { lazy, Suspense, useEffect, useState } from "react";

export interface MapDriverOrder {
  restaurantName: string | null;
  customerAddress: string | null;
}

export interface MapDriver {
  id: string;
  lat: number;
  lng: number;
  label: string;
  online: boolean;
  hasOrders?: boolean;
  activeCount?: number;
  /** Kept for backwards compat — first active order */
  restaurantName?: string | null;
  customerAddress?: string | null;
  /** All active orders for this driver */
  activeOrders?: MapDriverOrder[];
}

const InnerMap = lazy(() => import("./drivers-map-inner"));

export function DriversMap({ drivers }: { drivers: MapDriver[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="relative z-0 flex h-[420px] items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">جاري تحميل الخريطة…</div>;
  }
  return (
    <div className="relative z-0 isolate">
      <Suspense fallback={<div className="flex h-[420px] items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">جاري التحميل…</div>}>
        <InnerMap drivers={drivers} />
      </Suspense>
    </div>
  );
}
