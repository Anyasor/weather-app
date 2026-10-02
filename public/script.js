const cityInput = document.getElementById('cityInput');
const searchForm = document.getElementById('searchForm');
const geoBtn = document.getElementById('geoBtn');
const alertBox = document.getElementById('alert');
const alertMsg = document.getElementById('alertMsg');
const loading = document.getElementById('loading');
const weatherResult = document.getElementById('weatherResult');

function showError(message) {
    alertMsg.textContent = message;
    alertBox.classList.remove('d-none');
    alertBox.classList.add('show');
    setTimeout(() => {
        alertBox.classList.add('d-none');
        alertBox.classList.remove('show');
    }, 6000);
}

function renderCurrent(view) {
    document.getElementById('cityName').textContent = view.cityName;
    document.getElementById('currentDate').textContent = view.currentDate;
    document.getElementById('currentIcon').innerHTML = `<i class="bi ${view.icon}"></i>`;
    document.getElementById('currentTemp').textContent = `${view.temp}°`;
    document.getElementById('currentDesc').textContent = `${view.desc} · Feels like ${view.feelsLike}°`;
    document.getElementById('currentHighLow').innerHTML =
        `<i class="bi bi-arrow-up-short text-accent"></i> H ${view.high}°` +
        `<span class="mx-1">·</span>` +
        `<i class="bi bi-arrow-down-short text-white-75"></i> L ${view.low}°`;

    document.getElementById('statFeelsLike').textContent = `${view.feelsLike}°C`;
    document.getElementById('statHumidity').textContent = view.humidity;
    document.getElementById('statWind').textContent = view.wind;
    document.getElementById('statUV').textContent = view.uv;
    document.getElementById('statSunrise').textContent = view.sunrise;
    document.getElementById('statSunset').textContent = view.sunset;
}

function renderHourly(view) {
    const row = document.getElementById('hourlyRow');
    row.innerHTML = '';
    view.hourly.forEach((h) => {
        const card = document.createElement('div');
        card.className = 'hour-card';
        card.innerHTML = `
            <div class="hour-time">${h.time}</div>
            <div class="hour-icon my-2"><i class="bi ${h.icon}"></i></div>
            <div class="hour-temp">${h.temp}°</div>
            <div class="hour-precip">💧 ${h.precip}%</div>`;
        row.appendChild(card);
    });
}

function renderWeekly(view) {
    const row = document.getElementById('weeklyRow');
    row.innerHTML = '';
    view.weekly.forEach((d) => {
        const day = document.createElement('div');
        day.className = 'day-row';
        day.innerHTML = `
            <div class="day-name">${d.day}</div>
            <div class="day-icon"><i class="bi ${d.icon}"></i></div>
            <div class="temp-bar">
                <div class="temp-bar-fill" style="left: ${d.barLeft}%; width: ${d.barWidth}%"></div>
            </div>
            <div class="day-temps">
                <span class="hi">${d.high}°</span> <span class="lo">${d.low}°</span>
            </div>`;
        row.appendChild(day);
    });
}

function renderAll(view) {
    renderCurrent(view);
    renderHourly(view);
    renderWeekly(view);
    weatherResult.classList.remove('d-none');
}

async function loadWeather(query) {
    loading.classList.remove('d-none');
    weatherResult.classList.add('d-none');
    try {
        const res = await axios.get(`/api/weather?${query}`);
        renderAll(res.data);
    } catch (err) {
        showError(err.response?.data?.error || 'Weather data unavailable. Please try again.');
    } finally {
        loading.classList.add('d-none');
    }
}

function searchCity() {
    const city = cityInput.value.trim();
    if (!city) return;
    loadWeather(`city=${encodeURIComponent(city)}`);
}

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchCity();
});

geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser.');
        return;
    }
    loading.classList.remove('d-none');
    navigator.geolocation.getCurrentPosition(
        (position) => loadWeather(`lat=${position.coords.latitude}&lon=${position.coords.longitude}`),
        () => {
            loading.classList.add('d-none');
            showError('Could not get your location. Check browser permissions.');
        }
    );
});

if (weatherResult.classList.contains('d-none')) {
    loadWeather('city=Tokyo');
}
