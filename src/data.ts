/*! Glimmer | Developed by jvz | MIT License */
export interface PointData {
  countries: [string, string, string][];
  groups: string[];
  groupsEn: string[];
  timezones: string[];
  lat: number[];
  lng: number[];
  country: number[];
  group: number[];
  pop: number[];
  place: string[];
  tz: number[];
}

export const COLORS = [
  '#E8A9A0',
  '#D99A7E',
  '#7FC8C0',
  '#D8B26E',
  '#EDE3CC',
  '#9DB4D6',
  '#B7A3D9',
  '#A9C08A',
  '#E2C35A',
  '#C8B49A',
  '#8FA39C',
];

export type View = 'earth' | 'nebula';

export const CITIES = [
  {
    name: '北京',
    en: 'Beijing',
    lat: 39.9,
    lng: 116.4,
    country: '中国',
    cc: 'CN',
  },
  {
    name: '上海',
    en: 'Shanghai',
    lat: 31.23,
    lng: 121.47,
    country: '中国',
    cc: 'CN',
  },
  {
    name: '香港',
    en: 'Hong Kong',
    lat: 22.3,
    lng: 114.17,
    country: '中国香港',
    cc: 'HK',
  },
  {
    name: '台北',
    en: 'Taipei',
    lat: 25.03,
    lng: 121.56,
    country: '中国台湾',
    cc: 'TW',
  },
  {
    name: '东京',
    en: 'Tokyo',
    lat: 35.68,
    lng: 139.69,
    country: '日本',
    cc: 'JP',
  },
  {
    name: '京都',
    en: 'Kyoto',
    lat: 35.01,
    lng: 135.77,
    country: '日本',
    cc: 'JP',
  },
  {
    name: '首尔',
    en: 'Seoul',
    lat: 37.57,
    lng: 126.98,
    country: '韩国',
    cc: 'KR',
  },
  {
    name: '新加坡',
    en: 'Singapore',
    lat: 1.35,
    lng: 103.82,
    country: '新加坡',
    cc: 'SG',
  },
  {
    name: '曼谷',
    en: 'Bangkok',
    lat: 13.76,
    lng: 100.5,
    country: '泰国',
    cc: 'TH',
  },
  {
    name: '孟买',
    en: 'Mumbai',
    lat: 19.08,
    lng: 72.88,
    country: '印度',
    cc: 'IN',
  },
  {
    name: '迪拜',
    en: 'Dubai',
    lat: 25.2,
    lng: 55.27,
    country: '阿联酋',
    cc: 'AE',
  },
  {
    name: '伊斯坦布尔',
    en: 'Istanbul',
    lat: 41.01,
    lng: 28.98,
    country: '土耳其',
    cc: 'TR',
  },
  {
    name: '巴黎',
    en: 'Paris',
    lat: 48.86,
    lng: 2.35,
    country: '法国',
    cc: 'FR',
  },
  {
    name: '伦敦',
    en: 'London',
    lat: 51.51,
    lng: -0.13,
    country: '英国',
    cc: 'GB',
  },
  {
    name: '柏林',
    en: 'Berlin',
    lat: 52.52,
    lng: 13.4,
    country: '德国',
    cc: 'DE',
  },
  {
    name: '罗马',
    en: 'Rome',
    lat: 41.9,
    lng: 12.5,
    country: '意大利',
    cc: 'IT',
  },
  {
    name: '马德里',
    en: 'Madrid',
    lat: 40.42,
    lng: -3.7,
    country: '西班牙',
    cc: 'ES',
  },
  {
    name: '纽约',
    en: 'New York',
    lat: 40.71,
    lng: -74.01,
    country: '美国',
    cc: 'US',
  },
  {
    name: '洛杉矶',
    en: 'Los Angeles',
    lat: 34.05,
    lng: -118.24,
    country: '美国',
    cc: 'US',
  },
  {
    name: '多伦多',
    en: 'Toronto',
    lat: 43.65,
    lng: -79.38,
    country: '加拿大',
    cc: 'CA',
  },
  {
    name: '墨西哥城',
    en: 'Mexico City',
    lat: 19.43,
    lng: -99.13,
    country: '墨西哥',
    cc: 'MX',
  },
  {
    name: '圣保罗',
    en: 'São Paulo',
    lat: -23.55,
    lng: -46.63,
    country: '巴西',
    cc: 'BR',
  },
  {
    name: '布宜诺斯艾利斯',
    en: 'Buenos Aires',
    lat: -34.6,
    lng: -58.38,
    country: '阿根廷',
    cc: 'AR',
  },
  {
    name: '开普敦',
    en: 'Cape Town',
    lat: -33.92,
    lng: 18.42,
    country: '南非',
    cc: 'ZA',
  },
  {
    name: '开罗',
    en: 'Cairo',
    lat: 30.04,
    lng: 31.24,
    country: '埃及',
    cc: 'EG',
  },
  {
    name: '悉尼',
    en: 'Sydney',
    lat: -33.87,
    lng: 151.21,
    country: '澳大利亚',
    cc: 'AU',
  },
  {
    name: '奥克兰',
    en: 'Auckland',
    lat: -36.85,
    lng: 174.76,
    country: '新西兰',
    cc: 'NZ',
  },
];

export function nearestCity(data: PointData, index: number, english = false): string {
  const lat = data.lat[index] / 100,
    lng = data.lng[index] / 100;
  let closest = CITIES[0],
    distance = Infinity;

  for (const city of CITIES) {
    const d =
      (lat - city.lat) ** 2 +
      (Math.min(Math.abs(lng - city.lng), 360 - Math.abs(lng - city.lng)) *
        Math.cos(lat * Math.PI / 180)) ** 2;

    if (d < distance) {
      distance = d;
      closest = city;
    }
  }

  if (distance < 3) return english ? closest.en : closest.name;
  return data.place[index]?.trim() || data.countries[data.country[index]][english ? 2 : 1];
}

export function coordinates(data: PointData, index: number) {
  const lat = data.lat[index] / 100,
    lng = data.lng[index] / 100;
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}  ·  ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
}

export function seedRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
