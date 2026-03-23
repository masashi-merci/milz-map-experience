import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import type { AppLanguage, MapFocusPin, Spot, UserRole } from '../types/app';

const spotPin = new L.DivIcon({
  className: 'custom-pin',
  html: '<div class="custom-pin__dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const focusPin = new L.DivIcon({
  className: 'custom-pin custom-pin--focus',
  html: '<div class="custom-pin__dot"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function SyncMapView({ focus, center, tabActive }: { focus: MapFocusPin | null; center: [number, number]; tabActive: boolean }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 200);
    return () => window.clearTimeout(timer);
  }, [map, center, focus, tabActive]);

  useEffect(() => {
    if (!tabActive) return;
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (focus) {
        map.flyTo([focus.lat, focus.lng], 15, { duration: 1.1 });
      } else {
        map.flyTo(center, 13, { duration: 0.9 });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focus, center, map, tabActive]);

  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map]);

  return null;
}

function PickSpot({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FocusMarker({ focus }: { focus: MapFocusPin | null }) {
  const markerRef = useRef<L.Marker>(null);
  useEffect(() => {
    if (focus && markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [focus]);
  if (!focus) return null;
  return (
    <Marker ref={markerRef} position={[focus.lat, focus.lng]} icon={focusPin}>
      <Popup>
        <div className="spot-popup">
          <strong>{focus.title}</strong>
          {focus.description ? <p>{focus.description}</p> : null}
        </div>
      </Popup>
    </Marker>
  );
}

export function MapPanel({
  center,
  spots,
  focus,
  authRole,
  onFavorite,
  onMapPick,
  isFavorite,
  language,
  tabActive,
}: {
  center: [number, number];
  spots: Spot[];
  focus: MapFocusPin | null;
  authRole: UserRole;
  onFavorite: (spot: Spot) => void;
  onMapPick: (lat: number, lng: number) => void;
  isFavorite: (spotId: string) => boolean;
  language: AppLanguage;
  tabActive: boolean;
}) {
  const labels = t(language);

  return (
    <div className="panel map-panel">
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }} preferCanvas={true}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
          maxZoom={20}
          subdomains={["a", "b", "c", "d"]}
          updateWhenIdle={true}
        />
        <SyncMapView focus={focus} center={center} tabActive={tabActive} />
        <PickSpot enabled={authRole === 'admin'} onPick={onMapPick} />
        {spots.map((spot) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={spotPin}>
            <Popup>
              <div className="spot-popup">
                {spot.imageUrl ? <img src={spot.imageUrl} alt={spot.title} className="spot-popup__thumb" /> : null}
                <strong>{spot.title}</strong>
                <p>{spot.description}</p>
                {spot.website ? <a href={spot.website} target="_blank" rel="noreferrer">Website</a> : null}
                <button className={isFavorite(spot.id) ? 'heart-button is-saved' : 'heart-button'} onClick={() => onFavorite(spot)}>
                  {isFavorite(spot.id) ? `♥ ${labels.saved}` : `♡ ${labels.save}`}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FocusMarker focus={focus} />
      </MapContainer>
    </div>
  );
}
