import { cacheRates, readRates } from "./db";
import type { RatesState } from "./types";

export async function fetchRates(supabaseUrl?: string, anonKey?: string): Promise<RatesState> {
  if (!supabaseUrl || !anonKey) {
    const cached = await readRates<RatesState>();
    if (cached) return cached;
    throw new Error("需要先配置 Supabase，汇率由云函数抓取中国银行数据");
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/boc-rates`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`
    }
  });
  if (!response.ok) throw new Error("汇率云函数暂时不可用");
  const rates = (await response.json()) as RatesState;
  await cacheRates(rates);
  return rates;
}

export async function getCachedRates() {
  return readRates<RatesState>();
}
