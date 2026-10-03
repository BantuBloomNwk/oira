import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, TrendingUp, Info, Activity, Sparkles } from 'lucide-react';
import { TrendDataPoint } from '../types';
import { skinTrendDataSets } from '../data/paletteData';

interface SkinTrendsCardProps {
  onInspectTrendPoint?: (point: TrendDataPoint) => void;
}

export const SkinTrendsCard: React.FC<SkinTrendsCardProps> = ({ onInspectTrendPoint }) => {
  const [selectedRange, setSelectedRange] = useState<'1 Month' | '3 Months' | '6 Months' | '1 Year'>('3 Months');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<'tone' | 'radiance' | 'undertone'>('tone');

  const trendData = skinTrendDataSets[selectedRange] || skinTrendDataSets['3 Months'];

  // SVG Chart calculation helper
  // SVG coordinates: viewBox 0 0 500 160
  const width = 500;
  const height = 140;
  const paddingX = 30;
  const paddingY = 25;

  const pointsCount = trendData.length;
  const minVal = 70;
  const maxVal = 100;

  const getY = (val: number) => {
    const normalized = (val - minVal) / (maxVal - minVal);
    return height - paddingY - normalized * (height - 2 * paddingY);
  };

  const getX = (index: number) => {
    return paddingX + (index / (pointsCount - 1)) * (width - 2 * paddingX);
  };

  // Build bezier curve path
  const generateSmoothPath = (values: number[]) => {
    if (values.length === 0) return '';
    const pts = values.map((val, i) => ({ x: getX(i), y: getY(val) }));

    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i != pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  };

  const primaryValues = trendData.map((d) =>
    activeMetric === 'tone' ? d.toneConsistency : activeMetric === 'radiance' ? d.radiance : d.undertoneCoolness
  );
  const secondaryValues = trendData.map((d) => d.radiance - 4 + (d.toneConsistency % 3));

  const primaryPath = generateSmoothPath(primaryValues);
  const secondaryPath = generateSmoothPath(secondaryValues);

  // Closed area for subtle rose gradient fill
  const lastX = getX(pointsCount - 1);
  const firstX = getX(0);
  const areaPath = `${primaryPath} L ${lastX},${height} L ${firstX},${height} Z`;

  const currentHoveredPoint = activePointIndex !== null ? trendData[activePointIndex] : trendData[trendData.length - 1];

  /* First to last on whichever metric she is looking at, rounded. Honest, and it goes
     negative when the series does. */
  const drift = Math.round(primaryValues[primaryValues.length - 1] - primaryValues[0]);

  return (
    <div className="mt-8">
      {/* Section Title.
          The "+14% Consistency" that used to sit here was a hardcoded string next to a
          hardcoded series, which is a number about nobody. It is computed off the series
          now, and the series says out loud that it is a sample until she has readings of
          her own. A chart that cannot tell her which of those two it is showing is worse
          than no chart. */}
      <div className="flex items-center justify-between mb-3 px-1 gap-2">
        <h3 className="font-display text-[24px] sm:text-[28px] font-normal text-[#1B1120] tracking-tight">
          Skin Trends
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-[#8A6580] shrink-0">
          <TrendingUp className={`w-3.5 h-3.5 ${drift >= 0 ? 'text-[#C9799B]' : 'text-[#8A6580] rotate-180'}`} />
          <span>{drift >= 0 ? '+' : ''}{drift}% over {selectedRange.toLowerCase()}</span>
        </div>
      </div>

      {/* Main Skin Trends Card */}
      <div
        id="skin-trends-card"
        className="bg-white rounded-[26px] p-5 sm:p-6 luxury-card-shadow border border-[#F3DDD6] transition-all relative"
      >
        {/* Card Header: Title & Dropdown */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h4 className="text-[17px] sm:text-[18px] font-medium text-[#1B1120]">
              {activeMetric === 'tone'
                ? 'Tone Consistency'
                : activeMetric === 'radiance'
                ? 'Skin Radiance'
                : 'Undertone Purity'}
            </h4>
            <div className="hidden sm:flex items-center gap-1 bg-[#FFFBF7] p-0.5 rounded-lg border border-[#F3E9E4]">
              <button
                onClick={() => setActiveMetric('tone')}
                className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                  activeMetric === 'tone' ? 'bg-[#43203B] text-white shadow-xs' : 'text-[#8A6580] hover:text-[#43203B]'
                }`}
              >
                Tone
              </button>
              <button
                onClick={() => setActiveMetric('radiance')}
                className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                  activeMetric === 'radiance' ? 'bg-[#43203B] text-white shadow-xs' : 'text-[#8A6580] hover:text-[#43203B]'
                }`}
              >
                Radiance
              </button>
            </div>
          </div>

          {/* Time Range Dropdown */}
          <div className="relative">
            <button
              id="time-range-dropdown-btn"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 text-[14px] font-medium text-[#43203B] bg-[#FFFBF7] hover:bg-[#FBF3EE] border border-[#F3DDD6] px-3 py-1.5 rounded-full transition-colors"
            >
              <span>{selectedRange}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div
                id="time-range-dropdown-menu"
                className="absolute right-0 top-full mt-1.5 bg-white border border-[#F3DDD6] rounded-2xl shadow-xl py-1.5 z-30 min-w-[120px]"
              >
                {(['1 Month', '3 Months', '6 Months', '1 Year'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      setSelectedRange(range);
                      setIsDropdownOpen(false);
                      setActivePointIndex(null);
                    }}
                    className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition-colors flex items-center justify-between ${
                      selectedRange === range ? 'bg-[#F3E9E4] text-[#C9799B]' : 'text-[#43203B] hover:bg-[#FFFBF7]'
                    }`}
                  >
                    <span>{range}</span>
                    {selectedRange === range && <span className="w-1.5 h-1.5 rounded-full bg-[#C9799B]" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* The date and its note, then the reading.

            This row used to overlap. `truncate` was on a flex container, where text-overflow
            has nothing to act on, and the container had no `min-w-0`, so a flex item cannot
            shrink below its own content: the note simply ran on underneath the percentage
            pill. The ellipsis belongs on the text node, and the row needs permission to
            shrink. Both are here now, plus a gap so the two never touch even at the limit. */}
        <div className="h-6 mb-2 flex items-center justify-between gap-2.5 text-xs px-1">
          <div className="min-w-0 flex-1 text-[#8A6580] flex items-baseline gap-1.5">
            <span className="font-semibold text-[#1B1120] shrink-0">{currentHoveredPoint.date}:</span>
            <span className="min-w-0 truncate">{currentHoveredPoint.notes}</span>
          </div>
          <div className="font-bold text-[#C9799B] bg-[#FBF3EE] px-2 py-0.5 rounded-full text-[11px] shrink-0 border border-[#EFDDE2]">
            {activeMetric === 'tone'
              ? `${currentHoveredPoint.toneConsistency}% Match`
              : `${currentHoveredPoint.radiance}% Radiance`}
          </div>
        </div>

        {/* SVG Chart Graphic */}
        <div className="relative w-full aspect-[2.6/1] sm:aspect-[3/1] select-none">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="pinkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E599A4" stopOpacity="0.38" />
                <stop offset="60%" stopColor="#F5D0D5" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#FAF2F4" stopOpacity="0.0" />
              </linearGradient>

              <linearGradient id="lineStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#D48694" />
                <stop offset="50%" stopColor="#C45A71" />
                <stop offset="100%" stopColor="#9C2042" />
              </linearGradient>
            </defs>

            {/* Subtle baseline grid line */}
            <line
              x1={paddingX}
              y1={height - 2}
              x2={width - paddingX}
              y2={height - 2}
              stroke="#F2E6E2"
              strokeWidth="1.5"
            />

            {/* Area Fill */}
            <path d={areaPath} fill="url(#pinkGradient)" />

            {/* Secondary subtle wave (undertone stabilization guide) */}
            <path
              d={secondaryPath}
              fill="none"
              stroke="#E8AAB4"
              strokeWidth="2"
              strokeOpacity="0.65"
              strokeDasharray="4 4"
            />

            {/* Primary smooth curved line */}
            <path
              d={primaryPath}
              fill="none"
              stroke="url(#lineStrokeGradient)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data point dots matching screenshot */}
            {trendData.map((d, i) => {
              const cx = getX(i);
              const cy = getY(
                activeMetric === 'tone' ? d.toneConsistency : activeMetric === 'radiance' ? d.radiance : d.undertoneCoolness
              );
              const isHovered = activePointIndex === i;

              return (
                <g
                  key={i}
                  className="cursor-pointer group"
                  onMouseEnter={() => setActivePointIndex(i)}
                  /* There is no hover on a phone, so a tap has to be what selects a point.
                     It used to only fire the callback, which meant the banner never moved
                     for the person the app is actually built for. */
                  onClick={() => {
                    setActivePointIndex(i);
                    onInspectTrendPoint?.(d);
                  }}
                >
                  {/* Invisible enlarged hit area for effortless touch */}
                  <circle cx={cx} cy={cy} r="18" fill="transparent" />

                  {/* Outer pulse when active */}
                  {isHovered && (
                    <circle cx={cx} cy={cy} r="10" fill="#A81838" fillOpacity="0.2" className="animate-ping" />
                  )}

                  {/* Outer ring */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? '6' : '4.5'}
                    fill="#FFFFFF"
                    stroke="#B43856"
                    strokeWidth="2.5"
                    className="transition-all duration-200"
                  />

                  {/* Center pip */}
                  <circle cx={cx} cy={cy} r={isHovered ? '2.5' : '1.8'} fill="#A81838" />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Whose readings these are.
            Every point on this chart is invented. Saying so costs one line and buys the
            only thing this screen is short of, which is her believing the line when it is
            finally her own. */}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFFBF7] border border-[#F3E9E4] px-3 py-2">
          <Info className="w-3.5 h-3.5 text-[#B4813C] shrink-0 mt-px" aria-hidden />
          <p className="text-[10.5px] leading-snug text-[#8A6580]">
            A sample run, not you. Your own line starts at your first reading and adds a
            point every time you scan.
          </p>
        </div>

        {/* Date labels on bottom matching screenshot (Jan 18, Aug 20, Dec 23) */}
        <div className="flex items-center justify-between text-[12px] sm:text-[13px] text-[#8A6580] font-medium pt-3 px-2 border-t border-[#F3E9E4]">
          {trendData.length >= 3 ? (
            <>
              <span>{trendData[0].shortDate}</span>
              <span>{trendData[Math.floor(trendData.length / 2)].shortDate}</span>
              <span>{trendData[trendData.length - 1].shortDate}</span>
            </>
          ) : (
            trendData.map((d, idx) => <span key={idx}>{d.shortDate}</span>)
          )}
        </div>
      </div>
    </div>
  );
};
