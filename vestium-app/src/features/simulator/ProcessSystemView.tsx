import { memo } from 'react';
import { Card } from '../../components/Card';

export const ProcessSystemView = memo(function ProcessSystemView({
  motorOn,
  inletValveOpen,
  outletValveOpen,
  tankLevelPct,
  alarmOn
}: {
  motorOn: boolean;
  inletValveOpen: boolean;
  outletValveOpen: boolean;
  tankLevelPct: number;
  alarmOn?: boolean;
}) {
  const flowIntoTank = motorOn && inletValveOpen;
  const flowOutOfTank = outletValveOpen;
  const pumpStroke = motorOn ? '#22c55e' : '#475569';
  const tankFillHeight = Math.max(0, Math.min(100, tankLevelPct));

  return (
    <Card title="Process View (Dynamic P&ID)">
      <p className="text-xs text-theme-secondary">
        System-level context view linked to simulator state. Use this to connect controller tags to process behavior.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <div className="rounded border border-theme-border bg-theme-base p-3">
          <svg viewBox="0 0 700 280" className="w-full">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
              </marker>
            </defs>

            <text x="20" y="28" fill="#cbd5e1" fontSize="12">Source Tank</text>
            <rect x="20" y="40" width="80" height="120" rx="6" fill="#0f172a" stroke="#334155" />
            <rect x="24" y={40 + (120 - 100)} width="72" height="100" fill="#0ea5e9" opacity="0.25" />

            <line x1="100" y1="100" x2="170" y2="100" stroke="#64748b" strokeWidth="4" markerEnd="url(#arrow)" />
            <circle cx="205" cy="100" r="28" fill="#020617" stroke={pumpStroke} strokeWidth="3" />
            <path d="M192 100 Q205 85 218 100 Q205 115 192 100" fill={motorOn ? '#22c55e' : '#334155'} opacity="0.7" />
            <text x="184" y="145" fill="#cbd5e1" fontSize="11">Pump/Motor</text>

            <line x1="233" y1="100" x2="300" y2="100" stroke="#64748b" strokeWidth="4" />
            <rect x="300" y="86" width="22" height="28" rx="4" fill="#020617" stroke={inletValveOpen ? '#22c55e' : '#f59e0b'} />
            <line x1="305" y1="90" x2="317" y2="110" stroke={inletValveOpen ? '#22c55e' : '#f59e0b'} strokeWidth="3" />
            <text x="282" y="130" fill="#cbd5e1" fontSize="11">Inlet Valve</text>

            <line x1="322" y1="100" x2="390" y2="100" stroke="#64748b" strokeWidth="4" markerEnd="url(#arrow)" />

            <text x="430" y="28" fill="#cbd5e1" fontSize="12">Process Tank</text>
            <rect x="430" y="40" width="120" height="170" rx="8" fill="#0f172a" stroke="#334155" />
            <rect
              x="434"
              y={44 + (162 - (162 * tankFillHeight) / 100)}
              width="112"
              height={(162 * tankFillHeight) / 100}
              fill="#38bdf8"
              opacity="0.35"
            />
            <text x="560" y="90" fill="#cbd5e1" fontSize="11">Level</text>
            <text x="560" y="108" fill="#f59e0b" fontSize="12">{tankFillHeight.toFixed(0)}%</text>

            <line x1="490" y1="210" x2="490" y2="246" stroke="#64748b" strokeWidth="4" />
            <rect x="478" y="246" width="24" height="24" rx="4" fill="#020617" stroke={outletValveOpen ? '#22c55e' : '#f59e0b'} />
            <line x1="482" y1="250" x2="498" y2="266" stroke={outletValveOpen ? '#22c55e' : '#f59e0b'} strokeWidth="3" />
            <line x1="490" y1="270" x2="620" y2="270" stroke="#64748b" strokeWidth="4" markerEnd="url(#arrow)" />
            <text x="520" y="244" fill="#cbd5e1" fontSize="11">Outlet Valve</text>
            <text x="630" y="274" fill="#cbd5e1" fontSize="11">Drain / Process Out</text>

            {flowIntoTank ? (
              <circle cx="360" cy="100" r="6" fill="#22c55e">
                <animate attributeName="cx" values="340;390" dur="0.7s" repeatCount="indefinite" />
              </circle>
            ) : null}
            {flowOutOfTank ? (
              <circle cx="560" cy="270" r="6" fill="#22c55e">
                <animate attributeName="cx" values="510;615" dur="0.7s" repeatCount="indefinite" />
              </circle>
            ) : null}
          </svg>
        </div>
        <div className="space-y-2 text-xs">
          <div className="rounded border border-theme-border bg-theme-base p-3">
            <p className="font-semibold text-theme-text">Equipment State</p>
            <p className="mt-2 text-theme-secondary">Pump/Motor: <span className={motorOn ? 'text-emerald-300' : 'text-theme-secondary'}>{motorOn ? 'RUNNING' : 'STOPPED'}</span></p>
            <p className="text-theme-secondary">Inlet Valve: <span className={inletValveOpen ? 'text-emerald-300' : 'text-theme-secondary'}>{inletValveOpen ? 'OPEN' : 'CLOSED'}</span></p>
            <p className="text-theme-secondary">Outlet Valve: <span className={outletValveOpen ? 'text-emerald-300' : 'text-theme-secondary'}>{outletValveOpen ? 'OPEN' : 'CLOSED'}</span></p>
            {alarmOn !== undefined ? (
              <p className="text-theme-secondary">Alarm: <span className={alarmOn ? 'text-rose-300' : 'text-theme-secondary'}>{alarmOn ? 'ACTIVE' : 'CLEAR'}</span></p>
            ) : null}
          </div>
          <div className="rounded border border-theme-border bg-theme-base p-3">
            <p className="font-semibold text-theme-text">Fault Domain Clues</p>
            <ul className="mt-2 space-y-1 text-theme-secondary">
              <li>Command true + no process movement: output/device/electrical path</li>
              <li>Valve state changed + no level response: process/device/mechanical issue</li>
              <li>Multiple indicators disagree: check feedback and telemetry before changing logic</li>
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
});

