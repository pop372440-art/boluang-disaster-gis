# GIS / weather audit improvements — 15 October 2026

Base: `59360081234574e7882b4940441d5366b6cee225` (`main`).

## Result

The GIS map, point weather page and flood station page now share an explicit area context. Selecting one of the 13 actual village polygons produces a stable village ID, name and representative point inside the polygon. Weather at that point is labelled as a point model estimate, never a measured village-wide total. Context links and return links retain the same village and coordinates.

### Map and mobile controls

- Added a single area selector and task presets for water/landslide reference, fire/air quality and reports/safe zones.
- Desktop starts with the left panel collapsed. Mobile starts with both panels collapsed, opens only one panel at a time and provides an explicit close action.
- Closed panel content is inert, so keyboard navigation does not enter an off-screen panel.
- Polygon clicks select the area without bubbling into the map's clear-selection handler.
- Changing layer visibility no longer unexpectedly flies back to the township centre.
- Village colours and reference-risk polygons are explicitly distinguished from current warning levels.

### Independent weather sources

- Weather, multi-model precipitation, CAMS and RainViewer requests settle independently. A failed or malformed source does not erase successful sources; a total failure still produces an error response.
- Missing PM/AQI and precipitation remain null. Genuine reported zero remains zero.
- Hourly forecast series join by normalized Bangkok timestamp rather than array offset. Expired historical series are not silently reused as the next forecast window.
- Added the planning summary of the maximum-per-hour model envelope, including the peak three-hour interval, distinct probability source and date across midnight.
- Added forecast metadata with explicit unknown run time. Retrieval time and forecast-valid time do not claim to be model-run freshness. The separate ECMWF/GFS single-run section remains township reference data and is labelled accordingly.
- Frame time and the latest observed radar time are shown separately. Client-side age checks continue to advance between fetches.
- Requests from an old weather location cannot overwrite a newer location. Reverse-geocoder results are also checked against the active point.

### Radar and evidence integrity

- A missing tile or out-of-bounds sample is unknown, never a dry pixel. Every pixel needed for a point sample must have a downloaded tile.
- The existing pixel-to-rain calculation is explicitly an estimate without local calibration. It is not eligible for the existing automatic popup/sound path.
- On-demand evidence separates satellite detections, CAMS model values, actual ThaiWater measurements and historical landslide reference geometry, with source and observation time.
- Satellite counts are spatially filtered to a loaded village polygon; if that boundary cannot be verified the panel does not claim a village count. Township context uses the provider's 50 km query area.
- Nearby station rows are filtered to 50 km and labelled inside/outside the village when the boundary is available. Distance does not establish an upstream catchment connection.
- New `/api/gis/stations` keeps the raw national response on the server and returns a minimal local subset. It avoids placing the national rain response, which exceeded 2 MB during testing, in Next's fetch cache or shipping it to the evidence panel.
- Future-dated weather/station observations are not classified as fresh.

### Build portability

Renamed the React component `SmoothRadar.tsx` to `RadarOverlay.tsx` while keeping the canvas implementation `smoothRadar.ts`. TypeScript no longer resolves the component to the wrong file on a case-insensitive Windows filesystem.

## Validation

- `npm test`: 140 passed, 0 failed, including returning a custom point from weather to GIS.
- `npm run typecheck`: passed.
- `npm run build`: passed, including type validation and static generation.
- Explicit ESLint checks passed for the new GIS components/helpers/tests, the weather API, new station API and updated shared quality utilities.
- The legacy pages still contain pre-existing explicit-any lint errors. Targeted baseline comparison did not add errors; the API removes its old explicit-any sites. Do not interpret the current bare `npm run lint` command as coverage of TypeScript files: it returned an empty result list in this environment.
- Browser checks: desktop selection of village 8; mobile 390×844 starts collapsed; select/open/close controls; context retained from GIS to weather to flood; live weather and station APIs returned 200; on-demand evidence rendered local station rows and missing fire coverage without claiming zero.
- Leaflet Fast Refresh produced a development-only map-pane error during editing. Reloading cleared it; ordinary page loading and navigation were subsequently checked. Production build completed successfully.

## Explicit remaining limits

- The automatic multi-model forecast endpoint does not expose a verified run time for every model. This patch reports that limitation; it does not invent run metadata.
- Downloaded tile coverage is not a scientific radar-coverage mask. Local calibration, coverage validation against ground observations and ETA/backtesting remain separate work before any accuracy claim.
- Fire data requires an existing configured provider credential. Unconfigured or unavailable coverage is displayed as unavailable rather than zero detections.
- No public coordinate dataset of verified citizen reports was added. Existing reporting and staff workflows remain the source of truth; the evidence panel states this gap rather than treating all received reports as verified.
- No catchment topology, soil saturation model, flood travel-time calculation or official-warning automation was added.
- No database schema, account permissions, production environment variables or production deployment was changed by this patch.
