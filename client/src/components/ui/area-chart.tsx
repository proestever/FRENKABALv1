import * as React from "react";
import { 
  Area, 
  AreaChart as RechartsAreaChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis 
} from "recharts";

interface AreaChartProps {
  data: any[];
  xKey?: string;
  yKey?: string;
  color?: string;
  height?: number;
  tooltipTitle?: string;
  tooltipFormatter?: (value: number) => string;
  className?: string;
}

export const AreaChart = ({
  data,
  xKey = "name",
  yKey = "value",
  color = "rgba(75, 122, 236, 0.9)",
  height = 200,
  tooltipTitle = "Value",
  tooltipFormatter = (value: number) => `${value}`,
  className = "",
}: AreaChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div className={`w-full h-[${height}px] flex items-center justify-center ${className}`}>
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey={xKey} 
            axisLine={false}
            tickLine={false}
            stroke="#888888"
            fontSize={12}
            tickMargin={8}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            stroke="#888888"
            fontSize={12}
            tickMargin={8}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-card border rounded-md shadow-sm p-2">
                    <p className="text-xs font-medium">{payload[0].payload[xKey]}</p>
                    <p className="text-xs font-bold">
                      {tooltipTitle}: {tooltipFormatter(payload[0].value as number)}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={color}
            fillOpacity={1}
            fill="url(#colorGradient)"
          />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
};