import { cacheWeather, readWeather } from "./db";
import type { WeatherDay, WeatherState } from "./types";

type GeoResult = {
  results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>;
};

type ReverseGeoResult = {
  results?: Array<{ name: string; country?: string; admin1?: string }>;
};

type ForecastResult = {
  current?: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
};

type WeatherPlace = {
  city: string;
  latitude: number;
  longitude: number;
};

const cleanPlacePart = (value?: string) => value?.replace(/市$/u, "").trim();

const joinPlaceParts = (...parts: Array<string | undefined>) => {
  const unique = parts
    .map(cleanPlacePart)
    .filter((part): part is string => Boolean(part))
    .filter((part, index, list) => list.indexOf(part) === index);
  return unique.join(" · ");
};

const formatPlace = (place: { name: string; country?: string; admin1?: string }) => {
  const isChina = place.country === "中国" || place.country === "China";
  if (isChina) return joinPlaceParts(place.admin1, place.name) || place.name;
  return joinPlaceParts(place.name, place.admin1, place.country) || place.name;
};

const weatherSourceUrl = (city: string, latitude: number, longitude: number) => {
  const query = `${city} 15天天气预报 ${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

async function placeFromCity(city: string): Promise<WeatherPlace> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", city);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geo = (await fetch(geoUrl).then((res) => res.json())) as GeoResult;
  const place = geo.results?.[0];
  if (!place) throw new Error("没有找到这个城市");
  return {
    city: formatPlace(place),
    latitude: place.latitude,
    longitude: place.longitude
  };
}

async function placeFromCoordinates(latitude: number, longitude: number, fallbackCity?: string): Promise<WeatherPlace> {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  geoUrl.searchParams.set("latitude", String(latitude));
  geoUrl.searchParams.set("longitude", String(longitude));
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "zh");
  geoUrl.searchParams.set("format", "json");

  const geo = (await fetch(geoUrl).then((res) => res.json()).catch(() => undefined)) as ReverseGeoResult | undefined;
  const place = geo?.results?.[0];
  return {
    city: place ? formatPlace(place) : fallbackCity || "定位位置",
    latitude,
    longitude
  };
}

function buildForecastDays(daily?: ForecastResult["daily"]): WeatherDay[] {
  if (!daily?.time?.length) return [];
  return daily.time.slice(0, 15).map((date, index) => ({
    date,
    weatherCode: daily.weather_code?.[index] ?? 0,
    temperatureMax: daily.temperature_2m_max?.[index] ?? 0,
    temperatureMin: daily.temperature_2m_min?.[index] ?? 0,
    precipitationProbability: daily.precipitation_probability_max?.[index]
  }));
}

async function fetchForecast(place: WeatherPlace): Promise<WeatherState> {
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  forecastUrl.searchParams.set("forecast_days", "15");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecast = (await fetch(forecastUrl).then((res) => res.json())) as ForecastResult;
  if (!forecast.current) throw new Error("天气服务暂时不可用");

  const weather: WeatherState = {
    city: place.city,
    temperature: forecast.current.temperature_2m,
    weatherCode: forecast.current.weather_code,
    windSpeed: forecast.current.wind_speed_10m,
    forecast: buildForecastDays(forecast.daily),
    sourceUrl: weatherSourceUrl(place.city, place.latitude, place.longitude),
    latitude: place.latitude,
    longitude: place.longitude,
    updatedAt: new Date().toISOString()
  };
  await cacheWeather(weather);
  return weather;
}

export async function fetchWeather(city: string): Promise<WeatherState> {
  return fetchForecast(await placeFromCity(city));
}

export async function fetchWeatherByCoordinates(latitude: number, longitude: number, fallbackCity?: string): Promise<WeatherState> {
  return fetchForecast(await placeFromCoordinates(latitude, longitude, fallbackCity));
}

export function getDevicePosition(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) return Promise.reject(new Error("当前浏览器不支持定位"));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error("没有获得定位权限")),
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 8000 }
    );
  });
}

export async function getCachedWeather() {
  return readWeather<WeatherState>();
}

export function weatherLabel(code?: number) {
  if (code === undefined) return "未知";
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气";
}
