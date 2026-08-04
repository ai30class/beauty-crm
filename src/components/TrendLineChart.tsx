import { View, Text } from 'react-native';
import type { TrendPoint } from '@/types/types';

const COLORS = {
  line: '#e8789a',
  dot: '#e8789a',
  fill: '#e8789a18',
  axis: '#c4a0ae',
  grid: '#f5e6ea',
  label: '#c4a0ae',
};

interface Props {
  data: TrendPoint[];
  height?: number;
}

export default function TrendLineChart({ data, height = 140 }: Props) {
  if (!data.length) return null;

  const W = 320;
  const H = height;
  const PAD_L = 44;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...data.map(d => d.total_income), 1);
  // 取好看的刻度（ceiling 到 nice number）
  const niceMax = Math.ceil(maxVal / 1000) * 1000 || 1000;
  const gridLines = 4;

  const toX = (i: number) => PAD_L + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => PAD_T + chartH - (v / niceMax) * chartH;

  // SVG path
  const pts = data.map((d, i) => `${toX(i)},${toY(d.total_income)}`);
  const linePath = `M ${pts.join(' L ')}`;

  // 填色 area
  const areaPath = data.length > 1
    ? `M ${toX(0)},${toY(0)} L ${pts.join(' L ')} L ${toX(data.length - 1)},${toY(0)} Z`
    : '';

  // Y 軸刻度
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = (niceMax / gridLines) * i;
    const y = toY(v);
    const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v);
    return { y, label };
  });

  // X 軸月份標籤（最多顯示 6 個）
  const step = Math.ceil(data.length / 6);
  const xLabels = data
    .map((d, i) => ({ i, label: `${d.month}月` }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <View style={{ width: '100%', height: H + 4 }}>
      {/* 用 View 模擬 SVG 座標系（cross-platform，無需 react-native-svg） */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        {/* 格線 */}
        {yTicks.map(({ y }, i) => (
          <View key={i} style={{
            position: 'absolute', left: PAD_L, top: y,
            width: chartW, height: 1, backgroundColor: COLORS.grid,
          }} />
        ))}

        {/* 面積填色（用漸層 View 疊加模擬） */}
        {data.length > 1 && data.map((d, i) => {
          if (i === 0) return null;
          const x1 = toX(i - 1); const y1 = toY(data[i - 1].total_income);
          const x2 = toX(i);     const y2 = toY(d.total_income);
          const segW = x2 - x1;
          const topY = Math.min(y1, y2);
          const botY = toY(0);
          return (
            <View key={`area-${i}`} style={{
              position: 'absolute', left: x1, top: topY,
              width: segW, height: botY - topY,
              backgroundColor: COLORS.fill,
            }} />
          );
        })}

        {/* 折線段 */}
        {data.map((d, i) => {
          if (i === 0) return null;
          const x1 = toX(i - 1); const y1 = toY(data[i - 1].total_income);
          const x2 = toX(i);     const y2 = toY(d.total_income);
          const dx = x2 - x1; const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={`line-${i}`} style={{
              position: 'absolute',
              left: x1, top: y1 - 1,
              width: len, height: 2.5,
              backgroundColor: COLORS.line,
              borderRadius: 2,
              transformOrigin: '0 50%',
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}

        {/* 資料點 */}
        {data.map((d, i) => (
          <View key={`dot-${i}`} style={{
            position: 'absolute',
            left: toX(i) - 4, top: toY(d.total_income) - 4,
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: '#fff', borderWidth: 2, borderColor: COLORS.dot,
          }} />
        ))}

        {/* Y 軸標籤 */}
        {yTicks.map(({ y, label }, i) => (
          <Text key={`yl-${i}`} style={{
            position: 'absolute', left: 0, top: y - 8,
            width: PAD_L - 4, textAlign: 'right',
            fontSize: 10, color: COLORS.label, fontVariant: ['tabular-nums'],
          }}>{label}</Text>
        ))}

        {/* X 軸標籤 */}
        {xLabels.map(({ i, label }) => (
          <Text key={`xl-${i}`} style={{
            position: 'absolute',
            left: toX(i) - 16, top: H - PAD_B + 6,
            width: 32, textAlign: 'center',
            fontSize: 10, color: COLORS.label,
          }}>{label}</Text>
        ))}
      </View>
    </View>
  );
}
