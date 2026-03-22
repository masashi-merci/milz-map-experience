import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import type { MapFocusPin, Spot } from '../types/app';

const pin = new L.DivIcon({
  className: 'custom-pin',
  html: '<div class="custom-pin__dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function FlyToFocus({ focus }: { focus: MapFocusPin | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], 15, { duration: 1.2 });
  }, [focus, map]);
  return null;
}

export function MapPanel({
  center,
  spots,
  focus,
  onFavorite,
}: {
  center: [number, number];
  spots: Spot[];
  focus: MapFocusPin | null;
  onFavorite: (spot: Spot) => void;
}) {
  return (
    <div className="panel map-panel">
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
        <FlyToFocus focus={focus} />
        {spots.map((spot) => (
          <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={pin}>
            <Popup>
              <div className="spot-popup">
                <strong>{spot.title}</strong>
                <p>{spot.description}</p>
                <button onClick={() => onFavorite(spot)}>♡ お気に入り</button>
              </div>
            </Popup>
          </Marker>
        ))}
        {focus && (
          <Marker position={[focus.lat, focus.lng]} icon={pin}>
            <Popup>
              <div className="spot-popup">
                <strong>{focus.title}</strong>
                {focus.description ? <p>{focus.description}</p> : null}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
