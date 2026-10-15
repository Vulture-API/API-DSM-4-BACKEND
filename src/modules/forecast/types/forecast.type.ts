export type ForecastDay = {
  /** Data local da estação (YYYY-MM-DD). */
  date: string;
  temperature_max: number | null;
  temperature_min: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  wind_speed_max_kmh: number | null;
  /** Código WMO do tempo previsto (0 = céu limpo). */
  weather_code: number | null;
};

export type ForecastQuery = {
  latitude: number;
  longitude: number;
  days: number;
};

export type StationForecast = {
  station_id: number;
  latitude: number;
  longitude: number;
  source: string;
  generated_at: Date;
  days: ForecastDay[];
};
