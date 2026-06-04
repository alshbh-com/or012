import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import type { MapDriver } from "./drivers-map";

function makeIcon(opts: { online: boolean; hasOrders: boolean; count: number }) {
  const bg = opts.online
    ? (opts.hasOrders
        ? "linear-gradient(135deg,#22d3ee,#a855f7)"
        : "linear-gradient(135deg,#22c55e,#10b981)")
    : "#64748b";
  const ring = opts.online ? (opts.hasOrders ? "#a855f7" : "#22c55e") : "#94a3b8";
  const badge = opts.hasOrders
    ? `<div style="position:absolute;top:-6px;right:-6px;background:#f43f5e;color:white;font-size:10px;font-weight:800;border-radius:9999px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid white;box-shadow:0 0 6px #f43f5e">${opts.count || "•"}</div>`
    : `<div style="position:absolute;top:-4px;right:-4px;background:#22c55e;color:white;font-size:9px;font-weight:700;border-radius:9999px;padding:1px 6px;border:2px solid white">فاضي</div>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:40px;height:40px">
      <div style="background:${bg};width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${ring};border:3px solid white;${opts.online ? "" : "opacity:.7"}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 17V6h11v11M14 9h4l3 4v4h-3"/></svg>
      </div>
      ${opts.online ? badge : ""}
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function FitBounds({ drivers }: { drivers: MapDriver[] }) {
  const map = useMap();
  useEffect(() => {
    if (drivers.length === 0) return;
    if (drivers.length === 1) {
      map.setView([drivers[0].lat, drivers[0].lng], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [drivers, map]);
  return null;
}

export default function DriversMapInner({ drivers }: { drivers: MapDriver[] }) {
  const center = useMemo<[number, number]>(() => [30.0444, 31.2357], []);
  return (
    <div className="h-[480px] w-full overflow-hidden rounded-lg border border-border shadow-soft">
      <MapContainer center={center} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds drivers={drivers} />
        {drivers.map((d) => (
          <Marker
            key={d.id}
            position={[d.lat, d.lng]}
            icon={makeIcon({ online: d.online, hasOrders: !!d.hasOrders, count: d.activeCount ?? 0 })}
          >
            <Popup>
              <div className="text-sm" dir="rtl">
                <div className="font-bold mb-1">{d.label}</div>
                <div className={d.online ? "text-green-600 font-semibold" : "text-gray-500"}>
                  {d.online ? "🟢 متصل" : "⚪ غير متصل"}
                </div>
                {d.hasOrders ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-pink-600 font-semibold">📦 متصل ومعه طلب</div>
                    {d.restaurantName && <div className="text-xs">المطعم: ({d.restaurantName})</div>}
                    {d.customerAddress && <div className="text-xs">عنوان العميل: {d.customerAddress}</div>}
                  </div>
                ) : (
                  <div className="text-emerald-600">✅ فاضي</div>
                )}
              </div>
            </Popup>

          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
