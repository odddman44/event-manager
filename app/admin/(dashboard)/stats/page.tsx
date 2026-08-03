import { Suspense } from "react";
import { StatsCharts } from "@/components/stats-charts";
import { createClient } from "@/lib/supabase/server";
import { getStatsData } from "@/src/services/admin-service";

async function StatsContent() {
  const supabase = await createClient();
  const data = await getStatsData(supabase);

  return (
    <StatsCharts
      eventTrend={data.eventTrend}
      userTrend={data.userTrend}
      statusDistribution={data.statusDistribution}
      topEvents={data.topEvents}
    />
  );
}

export default function AdminStatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">통계 분석</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          이벤트와 사용자 데이터를 시각적으로 분석하세요
        </p>
      </div>

      <Suspense>
        <StatsContent />
      </Suspense>
    </div>
  );
}
