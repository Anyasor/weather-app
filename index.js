import express from "express";
import axios from "axios";
import { OPENWEATHER_API_KEY } from "./config.js";

// Create the Express application and define the server port.
const app = express();
const port = 5000;

// Default city shown when the user has not entered a city.
const DEFAULT_CITY = "Tokyo";

// Map OpenWeather icon codes to Bootstrap Icon class names.
const iconMap = {
    '01d': 'bi-sun', '01n': 'bi-moon-stars',
    '02d': 'bi-cloud-sun', '02n': 'bi-cloud-moon',
    '03d': 'bi-cloud', '03n': 'bi-cloud',
    '04d': 'bi-cloud', '04n': 'bi-cloud',
    '09d': 'bi-cloud-drizzle', '09n': 'bi-cloud-drizzle',
    '10d': 'bi-cloud-rain', '10n': 'bi-cloud-rain',
    '11d': 'bi-cloud-lightning-rain', '11n': 'bi-cloud-lightning-rain',
    '13d': 'bi-snow2', '13n': 'bi-snow2',
    '50d': 'bi-cloud-fog2', '50n': 'bi-cloud-fog2'
};

// Lookup tables for formatting dates in the rendered view.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// URLs used to call the OpenWeather APIs.
const geocodingUrl = (city) =>
    `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_API_KEY}`;

const currentUrl = (lat, lon) =>
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${OPENWEATHER_API_KEY}`;

const forecastUrl = (lat, lon) =>
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${OPENWEATHER_API_KEY}`;

// Return a matching icon class, or fall back to a generic cloud icon.
function iconFor(code) {
    return iconMap[code] || 'bi-cloud';
}

// Convert a Unix timestamp and timezone offset to a formatted local time string.
function formatUnixTime(ts, tzOffsetSec) {
    const d = new Date((ts + tzOffsetSec) * 1000);
    const hour = d.getUTCHours();
    const minute = String(d.getUTCMinutes()).padStart(2, '0');
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = ((hour + 11) % 12) + 1;
    return `${hour12}:${minute} ${suffix}`;
}

// Convert a Unix timestamp and timezone offset to a friendly date string.
function formatDate(dt, tzOffsetSec) {
    const d = new Date((dt + tzOffsetSec) * 1000);
    return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Get the current hour for the target city using its timezone offset.
function cityLocalHour(tzOffsetSec) {
    return new Date(Date.now() + tzOffsetSec * 1000).getUTCHours();
}

// Build the view model that is rendered by the EJS template.
function buildView(current, forecast, nameOverride) {
    const c = current;
    const list = forecast.list;
    const tz = forecast.city.timezone;

    // Calculate readable wind speed and direction.
    const windSpeed = Math.round(c.wind.speed * 3.6); // m/s to km/h
    const windDir = Math.round(c.wind.deg / 45) % 8;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][windDir];
    const weather = c.weather[0];

    // Group forecast items by local date for the weekly summary.
    const days = new Map();
    for (const item of list) {
        const localDate = new Date((item.dt + tz) * 1000).toISOString().slice(0, 10);
        if (!days.has(localDate)) days.set(localDate, []);
        days.get(localDate).push(item);
    }

    const weekly = [...days.entries()].slice(0, 5).map(([localDate, items], i) => {
        let high = -Infinity;
        let low = Infinity;
        let maxPop = 0;
        let middayItem = items[0];
        for (const item of items) {
            high = Math.max(high, item.main.temp_max);
            low = Math.min(low, item.main.temp_min);
            maxPop = Math.max(maxPop, item.pop ?? 0);

            // Choose the item closest to midday for the day's icon/description.
            const hour = new Date((item.dt + tz) * 1000).getUTCHours();
            const middayHour = new Date((middayItem.dt + tz) * 1000).getUTCHours();
            if (Math.abs(hour - 12) < Math.abs(middayHour - 12)) middayItem = item;
        }

        const dateObj = new Date(`${localDate}T00:00:00Z`);
        return {
            day: i === 0 ? 'Today' : WEEKDAYS[dateObj.getUTCDay()],
            icon: iconFor(middayItem.weather[0].icon),
            desc: middayItem.weather[0].description,
            high: Math.round(high),
            low: Math.round(low),
            pop: Math.round(maxPop * 100)
        };
    });

    // Find the next forecast item after the current local hour.
    const nowHour = cityLocalHour(tz);
    let start = list.findIndex((item) => new Date((item.dt + tz) * 1000).getUTCHours() >= nowHour);
    if (start === -1) start = 0;

    const next12 = [];
    for (let i = start; i < start + 4 && i < list.length; i++) {
        const item = list[i];
        const d = new Date((item.dt + tz) * 1000);
        const hour = d.getUTCHours();
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const hour12 = ((hour + 11) % 12) + 1;
        next12.push({
            time: i === start ? 'Now' : `${hour12}:00 ${suffix}`,
            icon: iconFor(item.weather[0].icon),
            temp: Math.round(item.main.temp),
            precip: Math.round((item.pop ?? 0) * 100)
        });
    }

    // Prepare progress-bar values for the weekly temperature display.
    const weekMin = Math.min(...weekly.map((d) => d.low));
    const weekMax = Math.max(...weekly.map((d) => d.high));
    const span = weekMax - weekMin || 1;
    weekly.forEach((d) => {
        d.barLeft = ((d.low - weekMin) / span) * 100;
        d.barWidth = Math.max(((d.high - d.low) / span) * 100, 6);
    });

    return {
        cityName: nameOverride || c.name,
        currentDate: formatDate(c.dt, tz),
        temp: Math.round(c.main.temp),
        feelsLike: Math.round(c.main.feels_like),
        desc: weather.description,
        icon: iconFor(weather.icon),
        high: weekly[0].high,
        low: weekly[0].low,
        humidity: `${c.main.humidity}%`,
        wind: `${windSpeed} km/h ${compass}`,
        uv: '—',
        sunrise: formatUnixTime(c.sys.sunrise, tz),
        sunset: formatUnixTime(c.sys.sunset, tz),
        hourly: next12,
        weekly
    };
}

// Normalizes API errors into readable messages.
function apiErrorMessage(err) {
    if (err.response?.data?.message) return err.response.data.message;
    if (err.response?.status === 401) return 'Invalid API key. Check OPENWEATHER_API_KEY in your .env file.';
    return err.message;
}

// Ensure the OpenWeather API key is configured before making requests.
function ensureApiKey() {
    if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY.includes('PASTE_YOUR')) {
        throw new Error('OpenWeatherMap API key is missing. Get a free key at https://home.openweathermap.org/api_keys and add it to the OPENWEATHER_API_KEY line in your .env file.');
    }
}

// Look up geographic coordinates for a city name, then fetch weather by coordinates.
async function fetchByCity(city) {
    const geo = await axios.get(geocodingUrl(city));
    if (!geo.data.length) {
        throw new Error(`City "${city}" not found. Try another spelling.`);
    }
    const loc = geo.data[0];
    return fetchByCoords(loc.lat, loc.lon, loc.name);
}

// Fetch current weather and forecast data by latitude/longitude.
async function fetchByCoords(lat, lon, nameOverride) {
    ensureApiKey();
    const [currentRes, forecastRes] = await Promise.all([
        axios.get(currentUrl(lat, lon)),
        axios.get(forecastUrl(lat, lon))
    ]);
    return buildView(currentRes.data, forecastRes.data, nameOverride);
}

// Serve static assets from the public folder.
app.use(express.static('public'));

// Render the main page with weather for the requested city or a default city.
app.get('/', async (req, res) => {
    let view = null;
    let error = null;
    const requested = (req.query.city || '').trim();
    try {
        view = requested ? await fetchByCity(requested) : await fetchByCity(DEFAULT_CITY);
    } catch (err) {
        error = apiErrorMessage(err);
    }
    res.render('index.ejs', {
        pageTitle: 'Skyline Forecast — Professional Weather',
        view,
        error,
        year: new Date().getFullYear()
    });
});

// JSON API endpoint returning weather data for a city or coordinates.
app.get('/api/weather', async (req, res) => {
    const { city, lat, lon } = req.query;
    try {
        const view = city ? await fetchByCity(city) : await fetchByCoords(lat, lon);
        res.json(view);
    } catch (err) {
        res.status(404).json({ error: apiErrorMessage(err) });
    }
});

// Start the server if this file is executed directly.
app.listen(port, () => {
    console.log(`Weather app listening at http://localhost:${port}`);
});
