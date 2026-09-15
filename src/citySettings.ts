export function readCitySettings(search: string) {
  const params = new URLSearchParams(search);
  const size = Number(params.get('size'));
  return {
    citySize: Number.isInteger(size) && size >= 10 && size <= 100 ? size : 60,
    citySeed: params.get('seed')?.trim().slice(0, 120) || 'Alphen aan den Rijn',
  };
}
