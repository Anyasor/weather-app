# How the REST API Was Used in the 5.7 Project

The 5.7 Project is a weather forecast app that pulls real data from the **OpenWeatherMap REST API**. Unlike the earlier Open-Meteo version, OpenWeatherMap uses **API KEY authorization**: every request must carry the key or the API answers with `401 Unauthorized`.

The key lives in a `.env` file (never in committed code):

```
OPENWEATHER_API_KEY=PASTE_YOUR_OPENWEATHER_API_KEY_HERE
```

Get a free key at https://home.openweathermap.org/api_keys and put it in `.env`. The `dotenv` package loads that file into `process.env`, and `config.js` re-exports it:

```js
import "dotenv/config";

export const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
```

`.env` is listed in `.gitignore`, so the key stays out of git history; `.env.example` is committed as a template. Anyone cloning the project copies `.env.example` to `.env` and fills in their own key. The key is never exposed to the browser — only the server sends it.

## The REST Endpoints Used

REST works with **resources** and **HTTP methods** (GET/POST/PUT/DELETE). This app only reads data, so it only uses `GET`.

### 1. Geocoding API (resource: a list of places)
Turns a city name into latitude/longitude.

```
GET https://api.openweathermap.org/geo/1.0/direct?q=Tokyo&limit=1&appid=YOUR_KEY
```

- **Base URL:** `https://api.openweathermap.org`
- **Endpoint (path):** `/geo/1.0/direct`
- **Query parameters:** `q` (city name), `limit` (max results), `appid` (API key — the authentication)
- Built in `index.js` by `geocodingUrl()` with `encodeURIComponent()` to safely encode the city.

Response is an array; `results[0]` gives `.lat` and `.lon` plus the official `.name`.

### 2. Current weather (resource: a single location's current state)
```
GET https://api.openweathermap.org/data/2.5/weather?lat=35.67&lon=139.65&units=metric&appid=YOUR_KEY
```

### 3. 5-day / 3-hour forecast (resource: forecast entries)
```
GET https://api.openweathermap.org/data/2.5/forecast?lat=35.67&lon=139.65&units=metric&appid=YOUR_KEY
```
Returns 40 entries (every 3 hours × 5 days) — this is where the hourly and weekly data comes from.

## How Authentication Works

OpenWeatherMap's canonical REST auth is the `appid` query parameter on every request:

```js
const forecastUrl = (lat, lon) =>
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${OPENWEATHER_API_KEY}`;
```

`ensureApiKey()` in `index.js` checks the key was actually filled in and gives a friendly message if it wasn't. `apiErrorMessage()` maps REST error responses (HTTP status + JSON body) to readable messages:

- `401` → "Invalid API key. Check OPENWEATHER_API_KEY in your .env file."
- `404` → OpenWeatherMap's own message like "city not found"

## How the Requests Are Made (server side)

Axios makes the HTTP calls, so **the server is the API client**. Searching a city is a two-step REST workflow (`fetchByCity()` in `index.js`):

```js
const geo = await axios.get(geocodingUrl(city));        // 1) GET /geo/1.0/direct -> find coords
if (!geo.data.length) throw new Error(`City "${city}" not found. ...`);
const loc = geo.data[0];
return fetchByCoords(loc.lat, loc.lon, loc.name);       // 2) GET weather + forecast with coords
```

`fetchByCoords()` runs the current and forecast requests in parallel with `Promise.all`, then hands the raw responses to `buildView()`:

```js
const [currentRes, forecastRes] = await Promise.all([
    axios.get(currentUrl(lat, lon)),
    axios.get(forecastUrl(lat, lon))
]);
return buildView(currentRes.data, forecastRes.data, nameOverride);
```

## Processing the API Response

`buildView()` in `index.js` transforms the raw REST JSON into clean objects the page can render:

- `iconMap` translates OpenWeatherMap's icon codes (`01d`, `10n`, …) into Bootstrap icons.
- `formatUnixTime()` and `formatDate()` convert OpenWeatherMap's **Unix timestamps** (UTC seconds) into readable city-local times like "6:45 AM" using the city's timezone offset that the API returns.
- The 40 forecast entries are grouped by local date to compute each day's high/low and pick the midday weather (5 days).
- The next 12 hours are the forecast entries whose local hour is `>=` the current hour.
- Wind is converted from m/s to km/h and degrees to compass letters (N, NE, …).

So the server "cleans up" the third-party data before passing it to the page.

## Exposing Our Own API

The server also creates **its own mini REST API** at `/api/weather` (`index.js`) that accepts `?city=...` or `?lat=...&lon=...`, proxies to OpenWeatherMap, and returns the cleaned-up JSON:

```
GET /api/weather?city=Tokyo
GET /api/weather?lat=35.67&lon=139.65
```

It answers with REST-style status codes — `404` with `{ error: "..." }` when something fails. This shows the full lifecycle: our server is a **client** of OpenWeatherMap's REST API, and the browser is a **client** of our REST API.

## How the Browser Uses It (client side)

The page loads axios in the browser (`index.ejs`). When the user searches:

1. `searchCity()` (`public/script.js`) builds `?city=Tokyo`.
2. `loadWeather()` does `axios.get('/api/weather?city=Tokyo')` — the browser never sees the API key.
3. On success, `renderAll(res.data)` updates the DOM — current card, 12-hour strip, and 5-day outlook.
4. On failure, `showError()` displays the error message our server sent.

The "use my location" button uses the browser's `navigator.geolocation` API to grab coordinates, then calls our API with `lat` and `lon` instead of a city name.

## Full Data Flow

```
Browser (axios)  →  Our Express server  →  OpenWeatherMap REST API
                     │   (adds appid key)   │
                     │                      ├─ GET /geo/1.0/direct   -> coords
                     │                      ├─ GET /data/2.5/weather -> current
                     │                      └─ GET /data/2.5/forecast-> 5-day
                     │
                     buildView() transforms the raw JSON
                     │
Browser renders EJS/JS ←  JSON response from /api/weather
```

## Why This Design

- **API key stays on the server:** the browser only talks to our `/api/weather` endpoint, so the secret is never exposed.
- **Three REST calls per search:** geocode for coordinates, then current + forecast in parallel for those coordinates.
- **Query parameters are the "controls":** `units=metric`, `lang=en`, `limit=1` shape the response we get back.
- **Data transformation happens server-side:** the browser never sees Unix timestamps or raw icon codes.
- **REST error handling:** the app reads HTTP status codes and the JSON error body to show friendly messages.
