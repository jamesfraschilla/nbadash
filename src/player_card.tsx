"use client"

import React, { useState, useEffect } from 'react';
import {
  Target, Users, Shield, Layers, Zap, User,
  Activity, Snowflake, Flame, RefreshCw, NotebookPen, Share2, Check, ExternalLink
} from 'lucide-react';
import type { Player, PlayerStats } from "@/types/player"
import { createClient } from "@/lib/supabase/client"

// --- SKELETON LOADER ---
export function PlayerCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-full flex-none mx-auto rounded-2xl border border-white/10 bg-black/20 overflow-hidden shadow-2xl ${className}`}
      style={{ maxWidth: '340px', height: '450px', minHeight: '450px' }}
    >
      <div className="h-44 bg-white/5 animate-pulse relative">
        <div className="absolute top-4 left-4 w-12 h-12 bg-white/10 rounded-full" />
        <div className="absolute top-4 right-4 w-16 h-6 bg-white/10 rounded" />
        <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
      <div className="h-8 bg-white/10 animate-pulse w-full border-y border-white/5" />
      <div className="p-4 space-y-3">
        <div className="w-full h-24 bg-white/5 rounded-xl animate-pulse" />
        <div className="w-full h-12 bg-white/5 rounded-xl animate-pulse" />
      </div>
      <div className="absolute bottom-0 w-full h-10 bg-white/5 animate-pulse border-t border-white/5" />
    </div>
  )
}

// --- SUB-COMPONENTS ---

const HexBadge = ({ tier, letter, title, value, size = 18 }: { tier: string; letter: string; title?: string; value?: number | null; size?: number }) => {
  if (!tier || tier === "None" || tier === "NA") return null;
  const colors: Record<string, string> = {
    Diamond: "fill-cyan-400 stroke-cyan-200 text-cyan-950",
    Gold: "fill-amber-400 stroke-amber-200 text-amber-950",
    Silver: "fill-slate-300 stroke-slate-100 text-slate-800",
    Bronze: "fill-orange-700 stroke-orange-500 text-orange-100",
  };

  return (
    <div className="relative inline-flex items-center justify-center group/badge cursor-help">
      <div className="relative flex items-center justify-center filter drop-shadow-md transition-transform duration-200 group-hover/badge:scale-110 group-active/badge:scale-110">
        <svg width={size * 1.4} height={size * 1.4} viewBox="0 0 24 24" className={colors[tier] || colors.Bronze}>
          <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" strokeWidth="1.5" fillOpacity="0.95" />
        </svg>
        <span className="absolute text-[8px] font-black uppercase tracking-tighter">{letter}</span>
      </div>

      <div className="absolute opacity-0 group-hover/badge:opacity-100 group-active/badge:opacity-100 transition-opacity duration-200 bottom-full mb-1 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <div className="bg-black/90 text-[8px] font-bold text-white px-1.5 py-0.5 rounded border border-white/20 whitespace-nowrap shadow-xl">
          {title || letter}: {value !== undefined && value !== null ? Math.round(value) : 'NA'}
        </div>
      </div>
    </div>
  );
};

const SkillBar = ({ label, value, icon: Icon, badges = [] }: { label: string; value: number | null; icon: any; badges?: any[] }) => {
  const getTier = (val: number) => {
    if (val >= 90) return "Diamond";
    if (val >= 75) return "Gold";
    if (val >= 50) return "Silver";
    return "Bronze";
  };

  const isNA = value === null;
  const tier = isNA ? "Bronze" : getTier(value || 0);

  const getBarColor = (t: string) => {
    switch(t) {
      case "Diamond": return "#22d3ee";
      case "Gold":    return "#fbbf24";
      case "Silver":  return "#cbd5e1";
      case "Bronze":  return "#c2410c";
      default:        return "#475569";
    }
  };

  return (
    <div className="relative group">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-black/40 border border-white/10 shadow-[inner_0_1px_2px_rgba(0,0,0,0.5)]">
            <Icon size={11} className="text-white/80" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-white/90 italic drop-shadow-md">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 mr-1">
            {badges.map((b, idx) => <HexBadge key={idx} tier={b.tier} letter={b.letter} title={b.title} value={b.value} size={10} />)}
          </div>
          <span className="text-sm font-black text-white italic tabular-nums drop-shadow-md">
            {isNA ? "NA" : Math.round(value || 0)}
          </span>
        </div>
      </div>
      <div className="h-2 w-full bg-black/60 rounded-sm overflow-hidden border border-white/5 relative shadow-inner">
        <div
            className="h-full transition-all duration-1000 ease-out relative flex items-center"
            style={{ width: `${isNA ? 0 : value}%`, background: `linear-gradient(90deg, transparent 0%, ${getBarColor(tier)} 100%)` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 blur-[1px]" />
        </div>
      </div>
    </div>
  );
};

const TeamLogo = ({ teamCode, logoUrl, className = "w-10 h-10" }: { teamCode: string; logoUrl?: string, className?: string }) => (
  <div className={`${className} flex items-center justify-center`}>
    {logoUrl ? <img src={logoUrl} alt={teamCode} className="w-full h-full object-contain drop-shadow-lg" /> : <span className="text-white text-base font-black drop-shadow-md">{teamCode}</span>}
  </div>
);

const JerseyNumberBadge = ({ number, className = "w-10 h-10" }: { number: string | number; className?: string }) => (
  <div className={`${className} flex items-center justify-center`}>
    <span className="text-white text-xl font-black">#{number}</span>
  </div>
);

const ZonePill = ({ label, value, type }: { label: string; value: string; type: 'hot' | 'cold' }) => (
  <div className={`flex items-center justify-between px-2 py-1 rounded-md border text-[8px] w-full font-bold mb-1 last:mb-0 ${type === 'hot' ? "bg-emerald-950/60 text-emerald-200 border-emerald-500/30" : "bg-slate-900/60 text-slate-200 border-slate-500/30"}`}>
    <span className="truncate mr-1">{label}</span>
    <span className="tabular-nums opacity-90">{value}</span>
  </div>
);

const PerformanceDiamond = ({ score, date, opp }: { score: number, date?: string, opp?: string }) => {
    const styleClass = score >= 90 ? "text-cyan-400 fill-cyan-400/20" : score >= 75 ? "text-yellow-400 fill-yellow-400/20" : "text-gray-400 fill-gray-400/20";
    return (
        <div className="relative inline-flex items-center justify-center group/diamond cursor-help">
            <div className="relative flex items-center justify-center w-4 h-4 transition-transform duration-200 group-hover/diamond:scale-110 group-active/diamond:scale-110">
                {score >= 90 ? (
                    <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 ${styleClass}`}><path d="M6 3 L18 3 L22 9 L12 22 L2 9 L6 3 Z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.2"/></svg>
                ) : (
                    <div className={`w-2.5 h-2.5 rotate-45 border ${styleClass.replace("text", "border").replace("fill", "bg")}`} />
                )}
            </div>

            <div className="absolute opacity-0 group-hover/diamond:opacity-100 group-active/diamond:opacity-100 transition-opacity duration-200 bottom-full mb-1 left-1/2 -translate-x-1/2 pointer-events-none z-50">
              <div className="bg-black/90 text-[8px] font-bold text-white p-1.5 rounded border border-white/20 whitespace-nowrap shadow-xl flex flex-col items-center gap-0.5 leading-tight">
                {date && <span className="text-white/60">{date}</span>}
                {opp && <span>vs {opp}</span>}
                <span className={date || opp ? "mt-0.5 pt-0.5 border-t border-white/20 w-full text-center text-white/90" : "text-white/90"}>
                  Score: {Math.round(score)}
                </span>
              </div>
            </div>
        </div>
    );
};

// --- MAIN WRAPPER COMPONENT ---

interface ExtendedPlayerStats extends PlayerStats {
  ote_player_rating?: number;
  games_played?: number;
  minutes?: number;
}

interface PlayerCardProps {
  player: Player;
  stats: ExtendedPlayerStats | null;
  hotZones: { label: string; value: string; type: 'hot' }[];
  coldZones: { label: string; value: string; type: 'cold' }[];
  recentForm: any[];
  teamLogo?: string;
  teamColor?: string;
  teamCode?: string;
  jerseyNumber?: string | number;
  className?: string;
  badgeData?: any;
  playerSlug?: string;
}

export function PlayerCard({
  player,
  stats,
  hotZones,
  coldZones,
  recentForm,
  teamLogo,
  teamColor = "#000000",
  teamCode = "OTE",
  jerseyNumber = "0",
  className = "",
  badgeData: propBadgeData,
  playerSlug
}: PlayerCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [fetchedBadgeData, setFetchedBadgeData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justCopied, setJustCopied] = useState(false);

  const badgeData = propBadgeData || fetchedBadgeData;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const promises = [];
      if (!avatarUrl) {
          promises.push(fetch(`/api/ote/ote_players/v1/public/${player.id}`).then(res => res.ok ? res.json() : null).then(data => {
            if (data?.ote_player?.image_path) setAvatarUrl(`https://images.overtime.tv/${data.ote_player.image_path}`);
          }).catch(e => console.error(e)));
      }
      if (!propBadgeData) {
        const supabase = createClient();
        promises.push(
            supabase.from("player_season_badges").select("*").eq("ote_player_id", player.id).maybeSingle()
                .then(({ data }) => { if (data) setFetchedBadgeData(data); }, (e: any) => console.error(e))
        );
      }
      await Promise.all(promises);
      setIsLoading(false);
    };
    if (player?.id) fetchData();
  }, [player.id, propBadgeData]);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const slug = playerSlug || player.name.toLowerCase().replace(/\s+/g, '-');
    const url = `${window.location.origin}/card/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);
    }).catch(err => console.error('Failed to copy: ', err));
  };

  const cardUrl = playerSlug || player.name ? `/card/${playerSlug || player.name.toLowerCase().replace(/\s+/g, '-')}` : '#';

  if (!stats || isLoading) return <PlayerCardSkeleton className={className} />;

  const ratingValue = Math.round(stats.ote_player_rating ?? 0);

  const getMetallicTheme = (val: number) => {
    if (val >= 90) return {
      bg: "bg-gradient-to-br from-cyan-100 via-cyan-600 to-cyan-950",
      border: "border-cyan-400",
      textColor: "text-cyan-50",
      panelBg: "bg-black/40 border-cyan-500/20"
    };
    if (val >= 75) return {
      bg: "bg-gradient-to-br from-yellow-100 via-yellow-500 to-amber-900",
      border: "border-yellow-400",
      textColor: "text-yellow-50",
      panelBg: "bg-black/40 border-amber-500/20"
    };
    if (val >= 50) return {
      bg: "bg-gradient-to-br from-slate-100 via-slate-400 to-slate-800",
      border: "border-slate-300",
      textColor: "text-slate-50",
      panelBg: "bg-black/40 border-slate-400/20"
    };
    return {
      bg: "bg-gradient-to-br from-orange-200 via-orange-600 to-amber-950",
      border: "border-orange-400",
      textColor: "text-orange-50",
      panelBg: "bg-black/40 border-orange-500/20"
    };
  };

  const theme = getMetallicTheme(ratingValue);

  const getVal = (v: any): number | null => {
      if (v === undefined || v === null || v === 'NA' || v === '') return null;
      const parsed = parseFloat(v);
      return isNaN(parsed) ? null : parsed;
  };

  const calcMetric = (values: (number | null)[], type: 'avg' | 'max' | 'single') => {
      const validValues = values.filter(v => v !== null) as number[];
      if (validValues.length === 0) return null;
      if (type === 'max') return Math.max(...validValues);
      if (type === 'avg') return validValues.reduce((a, b) => a + b, 0) / validValues.length;
      return validValues[0];
  };

  const shootingVal = calcMetric([getVal(badgeData?.fg_pr), getVal(badgeData?.fg3_pr), getVal(badgeData?.ft_pr)], 'avg');
  const playmakingVal = calcMetric([getVal(badgeData?.ast_pr)], 'single');
  const reboundingVal = calcMetric([getVal(badgeData?.oreb_pr), getVal(badgeData?.dreb_pr)], 'avg');
  const defenseVal = calcMetric([getVal(badgeData?.blk_pr), getVal(badgeData?.stl_pr)], 'max');

  const badges = {
    shooting: [
      { letter: '2', title: '2-Point', tier: badgeData?.fg_pr_badge, value: getVal(badgeData?.fg_pr) },
      { letter: '3', title: '3-Point', tier: badgeData?.fg3_pr_badge, value: getVal(badgeData?.fg3_pr) },
      { letter: 'F', title: 'Free Throw', tier: badgeData?.ft_pr_badge, value: getVal(badgeData?.ft_pr) }
    ],
    playmaking: [{ letter: 'A', title: 'Assists', tier: badgeData?.ast_pr_badge, value: getVal(badgeData?.ast_pr) }],
    rebounding: [
      { letter: 'O', title: 'Offensive Reb', tier: badgeData?.oreb_pr_badge, value: getVal(badgeData?.oreb_pr) },
      { letter: 'D', title: 'Defensive Reb', tier: badgeData?.dreb_pr_badge, value: getVal(badgeData?.dreb_pr) }
    ],
    defense: [
      { letter: 'B', title: 'Blocks', tier: badgeData?.blk_pr_badge, value: getVal(badgeData?.blk_pr) },
      { letter: 'S', title: 'Steals', tier: badgeData?.stl_pr_badge, value: getVal(badgeData?.stl_pr) }
    ]
  };

  const scoutingLines = (() => {
    const lines: { text: string; score: number }[] = [];
    const getS = (k: string) => { const val = getVal(badgeData?.[k]); return val === null ? 0 : val; };
    const add = (text: string, score: number) => lines.push({ text, score });
    if (getS('fg3_pr') >= 90) add("Elite 3-point shooter", 100);
    else if (getS('fg3_pr') >= 80) add("Strong perimeter threat", 85);
    if (getS('ftR_pr') >= 90) add("Elite at getting to the line", 95);
    if (getS('fg_pr') >= 90) add("Elite finisher at the rim", 91);
    if (getS('ast_pr') >= 90) add("Elite floor general", 98);
    if (getS('oreb_pr') >= 90) add("Dominant offensive rebounder", 92);
    if (getS('blk_pr') >= 90) add("Elite rim protector", 94);
    if (getS('stl_pr') >= 90) add("High-level perimeter defender", 93);
    const ppg = stats.ppg || 0;
    if (ppg >= 20) add("Prolific scorer", 99);
    lines.sort((a, b) => b.score - a.score);
    const result = lines.map(l => l.text).slice(0, 3);
    if (result.length < 1) result.push("Developing prospect");
    return result;
  })();

  const GlossOverlays = () => (
      <>
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-black/20 pointer-events-none z-0" />
        <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-45 pointer-events-none z-0" />
      </>
  );

  return (
    <div
        className={`relative w-full flex-none mx-auto select-none [perspective:1000px] ${className}`}
        style={{ maxWidth: '340px', height: '450px', minHeight: '450px' }}
    >
      <div
        className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
        // FORCE a perfectly symmetric easing curve so 50% time = exactly 90 degrees rotation
        style={{ transitionTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)' }}
      >

        {/* --- FRONT SIDE WRAPPER --- */}
        <div
          className="absolute inset-0 w-full h-full z-20"
          style={{
            opacity: isFlipped ? 0 : 1,
            pointerEvents: isFlipped ? 'none' : 'auto',
            transition: 'opacity 0s linear 0.35s' // Snap opacity exactly halfway
          }}
        >
          {/* STYLING CONTAINER */}
          <div className={`relative w-full h-full rounded-2xl border-[3px] overflow-hidden shadow-2xl flex flex-col ${theme.bg} ${theme.border}`}>
            <GlossOverlays />

            <div className="relative h-44 flex items-end justify-center overflow-hidden z-10">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 mix-blend-overlay" />
              <div className="relative z-20 w-full h-full flex items-end justify-center pt-4">
                  {avatarUrl ? (
                      <img src={avatarUrl} alt={player.name} className="h-[135%] w-full object-contain object-bottom translate-y-8 drop-shadow-[0_15px_25px_rgba(0,0,0,0.6)]" />
                  ) : (
                      <User size={140} className="text-white/20 mb-[-10px] drop-shadow-lg" strokeWidth={1} />
                  )}
              </div>

              <div className="absolute top-4 left-4 z-30 flex flex-col items-center">
                  <span className={`text-5xl font-black italic leading-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] ${theme.textColor}`}>{ratingValue}</span>
                  <span className="text-[10px] font-black italic text-white/70 uppercase tracking-widest mt-[-2px]">OVR</span>
              </div>

              <div className="absolute top-4 right-4 z-30">
                  <div className="bg-black/40 backdrop-blur-md px-2.5 py-1 rounded text-[10px] font-black text-white border border-white/10 uppercase tracking-widest shadow-sm">
                      {player.position}
                  </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 via-black/10 to-transparent z-20" />
            </div>

            <div className="relative py-1 z-30 border-b border-white/10">
              <h2 className="text-xl font-black text-white uppercase text-center tracking-tighter drop-shadow-md">{player.name}</h2>
            </div>

            <div className="relative p-3 space-y-2 bg-black/30 backdrop-blur-sm flex-grow z-10">
              <div className="text-[7px] uppercase tracking-widest text-white/40 font-bold mb-2 pl-0.5">Skill Percentiles</div>
              <SkillBar label="Shooting" value={shootingVal} icon={Target} badges={badges.shooting} />
              <SkillBar label="Playmaking" value={playmakingVal} icon={Users} badges={badges.playmaking} />
              <SkillBar label="Rebounding" value={reboundingVal} icon={Layers} badges={badges.rebounding} />
              <SkillBar label="Steals + Blocks" value={defenseVal} icon={Shield} badges={badges.defense} />
            </div>

            <div className="relative p-2.5 bg-black/60 border-t border-white/10 flex justify-between items-center z-40">
              <div className="flex items-center gap-1.5">
                  <button onClick={handleShare} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 transition-all group">
                      {justCopied ? <Check size={10} className="text-emerald-400" /> : <Share2 size={10} className="text-white/70 group-hover:text-white" />}
                      <span className="text-[7px] font-black uppercase tracking-widest text-white/70 group-hover:text-white">{justCopied ? "COPIED" : "SHARE"}</span>
                  </button>
                  <a href={cardUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all flex items-center justify-center">
                      <ExternalLink size={10} />
                  </a>
              </div>
              <button onClick={() => setIsFlipped(true)} className="text-[9px] font-black text-white/70 uppercase hover:text-white transition-colors flex items-center gap-1 cursor-pointer"><RefreshCw size={10} /> Flip Card</button>
            </div>
          </div>
        </div>

        {/* --- BACK SIDE WRAPPER --- */}
        <div
          className="absolute inset-0 w-full h-full [transform:rotateY(180deg)] z-10"
          style={{
            opacity: isFlipped ? 1 : 0,
            pointerEvents: isFlipped ? 'auto' : 'none',
            transition: 'opacity 0s linear 0.35s' // Snap opacity exactly halfway
          }}
        >
          {/* STYLING CONTAINER */}
          <div className={`relative w-full h-full rounded-2xl border-[3px] shadow-2xl flex flex-col overflow-hidden ${theme.bg} ${theme.border}`}>
            <GlossOverlays />

            <div className="relative flex-grow pt-3 overflow-y-auto scrollbar-hide z-10">
              <div className="relative py-1 border-b border-white/10 text-center mb-2">
                  <h2 className="text-xl font-black text-white uppercase tracking-tight drop-shadow-md">{player.name}</h2>
              </div>

              <div className={`mx-4 mb-2 p-2 rounded-xl ${theme.panelBg} border border-white/10 shadow-lg flex flex-col items-center justify-center backdrop-blur-sm`}>
                  <div className="flex items-center justify-evenly w-full gap-2">
                    <div className="flex flex-col gap-2 items-center">
                      <div className="flex flex-col items-center"><span className="text-sm font-bold text-white leading-none">{player.position}</span><span className="text-[7px] text-white/60 uppercase font-bold tracking-wider">Position</span></div>
                      <div className="flex flex-col items-center"><span className="text-sm font-bold text-white leading-none">{player.class}</span><span className="text-[7px] text-white/60 uppercase font-bold tracking-wider">Class</span></div>
                    </div>
                    <div className="flex flex-col items-center gap-1 min-w-[50px]">
                       <TeamLogo teamCode={teamCode} logoUrl={teamLogo} className="w-12 h-12" />
                       <JerseyNumberBadge number={jerseyNumber} className="w-8 h-8" />
                    </div>
                    <div className="flex flex-col gap-2 items-center">
                      <div className="flex flex-col items-center"><span className="text-sm font-bold text-white leading-none">{player.height}</span><span className="text-[7px] text-white/60 uppercase font-bold tracking-wider">Height</span></div>
                      <div className="flex flex-col items-center"><span className="text-sm font-bold text-white leading-none">{player.weight}</span><span className="text-[7px] text-white/60 uppercase font-bold tracking-wider">Weight</span></div>
                    </div>
                  </div>
              </div>

              <div className="mx-4 mb-2">
                  <div className={`w-full p-2.5 rounded-lg ${theme.panelBg} border border-white/10 shadow-lg`}>
                     <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-white/5">
                          <NotebookPen size={12} className="text-white/80" />
                          <span className="text-[8px] font-black uppercase text-white/50 tracking-widest">Scouting Report</span>
                     </div>
                     <ul className="space-y-1">
                         {scoutingLines.map((line, idx) => (
                             <li key={idx} className="flex items-start gap-1.5">
                                 <div className="w-1 h-1 rounded-full bg-white/40 mt-1 shrink-0" />
                                 <span className="text-[10px] font-bold text-white/90 leading-tight">{line}</span>
                             </li>
                         ))}
                     </ul>
                  </div>
              </div>

              <div className="px-4 pb-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`flex flex-col p-2.5 rounded-lg ${theme.panelBg} border border-white/10 shadow-lg`}>
                    <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-white/5"><Flame size={12} className="text-emerald-400" /><span className="text-[10px] font-black uppercase text-white tracking-wider">Hot Zones</span></div>
                    {hotZones.length > 0 ? hotZones.map((z, i) => <ZonePill key={i} {...z} />) : <span className="text-[8px] text-white/40 italic">No hot zones</span>}
                  </div>
                  <div className={`flex flex-col p-2.5 rounded-lg ${theme.panelBg} border border-white/10 shadow-lg`}>
                    <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-white/5"><Snowflake size={12} className="text-slate-300" /><span className="text-[10px] font-black uppercase text-white tracking-wider">Cold Zones</span></div>
                    {coldZones.length > 0 ? coldZones.map((z, i) => <ZonePill key={i} {...z} />) : <span className="text-[8px] text-white/40 italic">No cold zones</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative px-4 py-3 bg-black/50 border-t border-white/10 flex items-center justify-between z-40 backdrop-blur-md">
              <div className="flex gap-2 items-center">
                  <span className="text-[8px] font-bold text-white/60 uppercase">Recent Form</span>
                  {recentForm.map((item, i) => {
                     const scoreVal = typeof item === 'number' ? item : (item.gamescore ?? item.score ?? 0);
                     const dateVal = typeof item === 'number' ? undefined : (item.gamedate ?? item.date);
                     const oppVal = typeof item === 'number' ? undefined : item.opp;
                     return <PerformanceDiamond key={i} score={scoreVal} date={dateVal} opp={oppVal} />
                  })}
              </div>
              <button onClick={() => setIsFlipped(false)} className="text-[9px] font-black text-white/70 uppercase hover:text-white transition-colors flex items-center gap-1 cursor-pointer">Flip Card <RefreshCw size={10} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}