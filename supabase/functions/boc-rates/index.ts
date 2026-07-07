import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type"
};

type RateRow = {
  currency: "USD" | "JPY";
  name: string;
  cashBuyingRate?: string;
  buyingRate?: string;
  sellingRate?: string;
  cashSellingRate?: string;
  publishAt?: string;
};

const decodeBocHtml = (buffer: ArrayBuffer) => {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (utf8.includes("美元") || utf8.includes("日元")) return utf8;
  return new TextDecoder("gb18030").decode(buffer);
};

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

function parseRows(html: string): RateRow[] {
  const targets: Record<string, RateRow["currency"]> = {
    "美元": "USD",
    "日元": "JPY"
  };

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1])))
    .filter((cells) => cells.length >= 7);

  return rows
    .map((cells) => {
      const currency = targets[cells[0]];
      if (!currency) return undefined;
      return {
        currency,
        name: cells[0],
        buyingRate: cells[1],
        cashBuyingRate: cells[2],
        sellingRate: cells[3],
        cashSellingRate: cells[4],
        publishAt: `${cells[6] || ""} ${cells[7] || ""}`.trim()
      };
    })
    .filter(Boolean) as RateRow[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : undefined;

  if (supabase) {
    const { data } = await supabase
      .from("exchange_rate_cache")
      .select("payload, fetched_at")
      .eq("id", "boc-usd-jpy")
      .maybeSingle();
    if (data?.payload?.rows?.length && Date.now() - new Date(data.fetched_at).getTime() < 6 * 60 * 60 * 1000) {
      return Response.json(data.payload, { headers: corsHeaders });
    }
  }

  const response = await fetch("https://www.boc.cn/sourcedb/whpj/");
  if (!response.ok) return Response.json({ rows: [], updatedAt: new Date().toISOString(), source: "中国银行" }, { status: 502, headers: corsHeaders });
  const html = decodeBocHtml(await response.arrayBuffer());
  const payload = {
    rows: parseRows(html),
    updatedAt: new Date().toISOString(),
    source: "中国银行外汇牌价"
  };

  if (supabase) {
    await supabase.from("exchange_rate_cache").upsert({
      id: "boc-usd-jpy",
      payload,
      fetched_at: new Date().toISOString()
    });
  }

  return Response.json(payload, { headers: corsHeaders });
});
