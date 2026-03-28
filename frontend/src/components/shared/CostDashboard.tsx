"use client";

import { useEffect, useState } from "react";
import { costApi } from "@/lib/api-client";

interface CostData {
  period_days: number;
  total_cost_usd: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  call_count: number;
  by_model: Array<{ model: string; cost_usd: number; calls: number }>;
  daily: Array<{ date: string; cost_usd: number; calls: number }>;
}

export default function CostDashboard() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await costApi.getTotal(period);
        setData(result);
      } catch (error) {
        console.error("Failed to fetch cost data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-warm border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">费用数据不可用</p>;
  }

  const totalTokens = data.total_prompt_tokens + data.total_completion_tokens;

  return (
    <div className="space-y-6">
      {/* 时间段选择 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">统计周期：</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`rounded-md px-3 py-1 text-sm ${
              period === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {d}天
          </button>
        ))}
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="总费用" value={`$${data.total_cost_usd.toFixed(4)}`} />
        <StatCard label="API 调用次数" value={data.call_count.toLocaleString()} />
        <StatCard label="总 Token 数" value={totalTokens.toLocaleString()} />
        <StatCard label="平均单次费用" value={`$${data.call_count > 0 ? (data.total_cost_usd / data.call_count).toFixed(6) : "0"}`} />
      </div>

      {/* 按模型统计 */}
      {data.by_model.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">按模型分布</h3>
          <div className="space-y-2">
            {data.by_model.map((item) => {
              const pct = data.total_cost_usd > 0 ? (item.cost_usd / data.total_cost_usd) * 100 : 0;
              return (
                <div key={item.model} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm text-muted-foreground">{item.model}</span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-warm" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="w-20 text-right text-sm text-foreground">${item.cost_usd.toFixed(4)}</span>
                  <span className="w-16 text-right text-xs text-muted-foreground">{item.calls} 次</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 每日趋势 */}
      {data.daily.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">每日费用趋势</h3>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {data.daily.map((day) => {
              const maxCost = Math.max(...data.daily.map((d) => d.cost_usd), 0.001);
              const height = (day.cost_usd / maxCost) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 rounded-t bg-warm/60 transition-all hover:bg-warm"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${day.date?.split("T")[0]}: $${day.cost_usd.toFixed(4)} (${day.calls} 次)`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
