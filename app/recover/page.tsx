'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import CandidateNav from '../components/CandidateNav';
import safetyData from '../data/kgtc-safety.json';
import equipmentModel from '../data/equipment-model.json';

type EquipmentRecord = { site: string; equipment: string; quantity: number; location: string };
type Data = { emergencyEquipment: { records: EquipmentRecord[]; bySite: Record<string, { items: number; quantity: number }> } };
type EquipmentModel = {
  architecture: string;
  description: string;
  data: { records: number; sites: number; equipmentTypes: number; positivePairs: number; allPairs: number; trainPairs: number; testPairs: number };
  metrics: { accuracy: number; auc: number; brier: number };
  sites: string[];
  equipment: string[];
  weights: {
    siteEmbedding: number[][];
    equipmentEmbedding: number[][];
    w1: number[][];
    b1: number[];
    w2: number[][];
    b2: number[];
    w3: number[][];
    b3: number[];
  };
};
type Requirement = { key: string; label: string; purpose: string; required: number; weight: number; patterns: string[] };
type SupportCandidate = {
  site: string;
  quantity: number;
  names: string[];
  locations: string[];
  neural: number;
  stockCoverage: number;
  remaining: number;
  safeAfter: boolean;
  rankValue: number;
};

const data = safetyData as Data;
const model = equipmentModel as EquipmentModel;
const number = new Intl.NumberFormat('ko-KR');
const accents = ['#63e6be', '#7c9cff', '#ffc857', '#ff7b72', '#d79cff', '#60c8e8', '#a5d66f', '#ff9ac2', '#62d8c3', '#ffa36c', '#83b7ff', '#e4cf63', '#8acb9b', '#c6a5ff'];

const sharedRequirements = {
  detector: { key: 'detector', label: '가스 검지', purpose: '누출 위치와 농도 확인', required: 2, weight: 3, patterns: ['가스검지', '메탄검지', 'fid'] },
  oxygen: { key: 'oxygen', label: '산소 검지', purpose: '산소결핍 확인', required: 1, weight: 3, patterns: ['산소검지', '산소농도측정'] },
  respirator: { key: 'respirator', label: '호흡 보호', purpose: '오염 구역 진입 보호', required: 2, weight: 3, patterns: ['공기호흡기', '송기마스크'] },
  ventilation: { key: 'ventilation', label: '환기', purpose: '가스·유해공기 배출', required: 1, weight: 2, patterns: ['송풍기', '배풍기'] },
  pump: { key: 'pump', label: '배수 펌프', purpose: '침수수 배출', required: 2, weight: 3, patterns: ['수중펌프', '배수펌프', '양수기', '잠수p/p', '엔진p/p', '엔진펌프', '후렉시블펌프'] },
  generator: { key: 'generator', label: '비상 전원', purpose: '정전 중 장비 전원 공급', required: 1, weight: 3, patterns: ['발전기', '이동형전원장치'] },
  cable: { key: 'cable', label: '전원 연결', purpose: '이동형 장비 전원 연결', required: 1, weight: 1, patterns: ['케이블릴', '케이블 릴'] },
  lighting: { key: 'lighting', label: '비상 조명', purpose: '야간·정전 시 시야 확보', required: 1, weight: 1, patterns: ['비상조명', '투광기', '서치등'] },
  crane: { key: 'crane', label: '인양 장비', purpose: '중량물 이동·회수', required: 1, weight: 3, patterns: ['크레인', '기중기'] },
  hoist: { key: 'hoist', label: '체인 블록', purpose: '정밀 인양과 고정', required: 2, weight: 2, patterns: ['체인블럭', '체인 블럭', '레버블럭', '레버 블럭'] },
  jack: { key: 'jack', label: '유압 잭', purpose: '설비 들어올림·간격 확보', required: 2, weight: 2, patterns: ['유압잭', 'hydrojack'] },
  insulation: { key: 'insulation', label: '절연 확인', purpose: '복전 전 절연 상태 확인', required: 1, weight: 2, patterns: ['절연저항', 'insulationtester'] },
  meter: { key: 'meter', label: '전기 계측', purpose: '전압·전류 상태 확인', required: 1, weight: 1, patterns: ['멀티메타', 'multimeter', '후크미터', 'hookmeter'] },
} satisfies Record<string, Requirement>;

const incidents = {
  leak: {
    label: '가스 누출',
    description: '가스가 설비 밖으로 새어 확산되거나 점화될 수 있는 상황',
    danger: '질식·화재·폭발과 누출 구역의 무리한 진입',
    firstResponse: '점화원 통제 → 바람을 등진 안전구역 확보 → 가스 농도 측정 → 차단·환기 판단',
    decision: '누출 범위를 수치로 확인한 뒤 보호구 없이는 진입하지 않습니다.',
    requirements: [sharedRequirements.detector, sharedRequirements.respirator, sharedRequirements.ventilation, sharedRequirements.lighting],
  },
  flood: {
    label: '침수',
    description: '기계실·전기실 또는 설비 주변에 물이 유입돼 운전과 접근이 어려운 상황',
    danger: '감전·설비 침수·배수 지연에 따른 가동중단 확대',
    firstResponse: '전원 상태 확인 → 접근구역 통제 → 배수 경로 확보 → 펌프와 비상전원 투입',
    decision: '통전 가능성이 있으면 배수보다 전기적 격리 확인이 먼저입니다.',
    requirements: [sharedRequirements.pump, sharedRequirements.generator, sharedRequirements.cable, sharedRequirements.lighting],
  },
  lift: {
    label: '중량물 사고',
    description: '중량 설비가 넘어지거나 끼이고, 인양 중 균형을 잃은 상황',
    danger: '2차 낙하·협착·불안정한 하중 아래 작업자 진입',
    firstResponse: '작업반경 통제 → 하중 상태 확인 → 이중 고정 → 인양·틈새 확보',
    decision: '하중을 지지할 장비와 보조 고정수단이 함께 있어야 인양을 시작합니다.',
    requirements: [sharedRequirements.crane, sharedRequirements.hoist, sharedRequirements.jack],
  },
  outage: {
    label: '정전',
    description: '전원 상실로 제어·계측·조명과 일부 안전설비가 멈춘 상황',
    danger: '암전 중 이동사고·임의 복전·설비 상태 오판',
    firstResponse: '비상조명 확보 → 전원 격리 확인 → 임시전원 연결 → 절연·전기 상태 확인 후 복전',
    decision: '발전기 보유만으로 복전하지 않고 절연과 계측 확인을 함께 수행합니다.',
    requirements: [sharedRequirements.generator, sharedRequirements.cable, sharedRequirements.insulation, sharedRequirements.meter, sharedRequirements.lighting],
  },
  confined: {
    label: '밀폐공간 사고',
    description: '맨홀·탱크처럼 출입이 제한된 공간에서 산소결핍이나 유해가스가 의심되는 상황',
    danger: '구조자의 연쇄 질식·유해가스 노출·배수 지연',
    firstResponse: '무보호 진입 금지 → 산소·가스 농도 측정 → 강제환기 → 호흡보호 후 구조',
    decision: '측정값과 구조용 보호장비가 확보되기 전에는 구조 목적이라도 진입하지 않습니다.',
    requirements: [sharedRequirements.detector, sharedRequirements.oxygen, sharedRequirements.respirator, sharedRequirements.ventilation, sharedRequirements.pump],
  },
} as const;
type IncidentKey = keyof typeof incidents;

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s()/_.,·-]/g, '');
}

function matches(name: string, requirement: Requirement) {
  const target = normalize(name);
  return requirement.patterns.some((pattern) => target.includes(normalize(pattern)));
}

function dense(input: number[], weights: number[][], biases: number[], activate = true) {
  return biases.map((bias, output) => {
    const value = input.reduce((sum, item, index) => sum + item * weights[index][output], bias);
    return activate ? Math.max(0, value) : 1 / (1 + Math.exp(-Math.max(-24, Math.min(24, value))));
  });
}

function compatibility(site: string, equipment: string) {
  const siteId = model.sites.indexOf(site);
  const equipmentId = model.equipment.indexOf(equipment);
  if (siteId < 0 || equipmentId < 0) return 0;
  const input = [...model.weights.siteEmbedding[siteId], ...model.weights.equipmentEmbedding[equipmentId]];
  const hidden1 = dense(input, model.weights.w1, model.weights.b1);
  const hidden2 = dense(hidden1, model.weights.w2, model.weights.b2);
  return dense(hidden2, model.weights.w3, model.weights.b3, false)[0];
}

function inventoryFor(site: string, requirement: Requirement) {
  const rows = data.emergencyEquipment.records.filter((row) => row.site === site && matches(row.equipment, requirement));
  return {
    quantity: rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
    names: [...new Set(rows.map((row) => row.equipment))],
    locations: [...new Set(rows.map((row) => row.location).filter(Boolean))],
  };
}

function readinessFor(items: { quantity: number; required: number; weight: number }[]) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  return Math.round(items.reduce((sum, item) => sum + item.weight * Math.min(item.quantity / item.required, 1), 0) / totalWeight * 100);
}

export default function RecoverGrid() {
  const [site, setSite] = useState('대전충청지사');
  const [incident, setIncident] = useState<IncidentKey>('leak');
  const siteIndex = Math.max(0, model.sites.indexOf(site));
  const incidentProfile = incidents[incident];
  const requirements = incidentProfile.requirements as readonly Requirement[];

  const inventory = useMemo(() => {
    const grouped: Record<string, { quantity: number; locations: string[] }> = {};
    data.emergencyEquipment.records.filter((row) => row.site === site).forEach((row) => {
      grouped[row.equipment] ||= { quantity: 0, locations: [] };
      grouped[row.equipment].quantity += Math.max(0, row.quantity);
      if (row.location && !grouped[row.equipment].locations.includes(row.location)) grouped[row.equipment].locations.push(row.location);
    });
    return grouped;
  }, [site]);

  const kit = requirements.map((requirement) => ({ ...requirement, ...inventoryFor(site, requirement) }));
  const readiness = readinessFor(kit);

  const transfers = kit.map((needed) => {
    const shortage = Math.max(0, needed.required - needed.quantity);
    const candidates: SupportCandidate[] = model.sites.filter((candidate) => candidate !== site).map((candidate) => {
      const stock = inventoryFor(candidate, needed);
      const learnedNames = model.equipment.filter((name) => matches(name, needed));
      const neural = learnedNames.length ? learnedNames.reduce((sum, name) => sum + compatibility(candidate, name), 0) / learnedNames.length : 0;
      const stockCoverage = shortage > 0 ? Math.min(stock.quantity / shortage, 1) : 1;
      const remaining = Math.max(0, stock.quantity - shortage);
      const safeAfter = remaining >= needed.required;
      const reserveScore = Math.min(remaining / Math.max(1, needed.required), 1);
      const rankValue = stockCoverage * 0.45 + (safeAfter ? 0.25 : 0) + reserveScore * 0.15 + neural * 0.15;
      return { site: candidate, ...stock, neural, stockCoverage, remaining, safeAfter, rankValue };
    }).filter((candidate) => candidate.quantity > 0)
      .sort((a, b) => Number(b.safeAfter) - Number(a.safeAfter) || b.rankValue - a.rankValue || b.quantity - a.quantity);
    return { ...needed, shortage, candidates };
  }).filter((item) => item.shortage > 0);

  const hubRanking = model.sites.filter((candidate) => candidate !== site).map((candidate) => {
    const available = transfers.map((transfer) => transfer.candidates.find((item) => item.site === candidate)).filter((item): item is SupportCandidate => Boolean(item));
    const safeCoverage = transfers.filter((transfer) => {
      const match = transfer.candidates.find((item) => item.site === candidate);
      return Boolean(match && match.quantity >= transfer.shortage && match.safeAfter);
    }).length;
    const averageRank = available.length ? available.reduce((sum, item) => sum + item.rankValue, 0) / available.length : 0;
    return { site: candidate, safeCoverage, averageRank };
  }).sort((a, b) => b.safeCoverage - a.safeCoverage || b.averageRank - a.averageRank);
  const supportHub = hubRanking[0]?.safeCoverage ? hubRanking[0].site : '';
  const supportPlan = transfers.map((transfer) => {
    const hubCandidate = transfer.candidates.find((candidate) => candidate.site === supportHub && candidate.quantity >= transfer.shortage && candidate.safeAfter);
    const selected = hubCandidate
      || transfer.candidates.find((candidate) => candidate.quantity >= transfer.shortage && candidate.safeAfter)
      || transfer.candidates.find((candidate) => candidate.quantity >= transfer.shortage)
      || transfer.candidates[0];
    const backup = transfer.candidates.find((candidate) => candidate.site !== selected?.site && candidate.quantity >= transfer.shortage && candidate.safeAfter)
      || transfer.candidates.find((candidate) => candidate.site !== selected?.site && candidate.quantity >= transfer.shortage)
      || transfer.candidates.find((candidate) => candidate.site !== selected?.site);
    return { ...transfer, selected, backup };
  }).sort((a, b) => b.weight * b.shortage - a.weight * a.shortage);
  const supportSites = [...new Set(supportPlan.map((item) => item.selected?.site).filter((item): item is string => Boolean(item)))];
  const transferUnits = supportPlan.reduce((sum, item) => sum + (item.selected ? Math.min(item.shortage, item.selected.quantity) : 0), 0);
  const depletedDonors = supportPlan.filter((item) => item.selected && item.selected.remaining === 0).length;

  const supportedKit = kit.map((item) => {
    const support = supportPlan.find((transfer) => transfer.key === item.key)?.selected;
    return { ...item, quantity: item.quantity + (support ? Math.min(support.quantity, Math.max(0, item.required - item.quantity)) : 0) };
  });
  const supportedReadiness = readinessFor(supportedKit);

  const adjustedQuantity = (targetSite: string, requirement: Requirement) => {
    let quantity = inventoryFor(targetSite, requirement).quantity;
    const plan = supportPlan.find((item) => item.key === requirement.key);
    if (!plan?.selected) return quantity;
    const moved = Math.min(plan.shortage, plan.selected.quantity);
    if (targetSite === site) quantity += moved;
    if (targetSite === plan.selected.site) quantity -= moved;
    return Math.max(0, quantity);
  };
  const readinessAt = (targetSite: string, adjusted = false) => readinessFor(requirements.map((requirement) => ({
    ...requirement,
    quantity: adjusted ? adjustedQuantity(targetSite, requirement) : inventoryFor(targetSite, requirement).quantity,
  })));
  const supportFloorBefore = supportSites.length ? Math.min(...supportSites.map((targetSite) => readinessAt(targetSite))) : null;
  const supportFloorAfter = supportSites.length ? Math.min(...supportSites.map((targetSite) => readinessAt(targetSite, true))) : null;
  const companyGapsBefore = model.sites.reduce((sum, targetSite) => sum + requirements.filter((requirement) => inventoryFor(targetSite, requirement).quantity < requirement.required).length, 0);
  const companyGapsAfter = model.sites.reduce((sum, targetSite) => sum + requirements.filter((requirement) => adjustedQuantity(targetSite, requirement) < requirement.required).length, 0);
  const keepsDonorReady = supportPlan.every((item) => !item.selected || item.selected.safeAfter);

  const allRequirements = Object.values(sharedRequirements) as Requirement[];
  const learnedGaps = allRequirements.map((requirement) => {
    const current = inventoryFor(site, requirement);
    const learnedNames = model.equipment.filter((name) => matches(name, requirement));
    const neural = learnedNames.length ? learnedNames.reduce((sum, name) => sum + compatibility(site, name), 0) / learnedNames.length : 0;
    const peerSites = model.sites.filter((targetSite) => targetSite !== site && inventoryFor(targetSite, requirement).quantity > 0);
    const peerQuantity = peerSites.reduce((sum, targetSite) => sum + inventoryFor(targetSite, requirement).quantity, 0);
    const usedIn = Object.values(incidents).filter((profile) => profile.requirements.some((item) => item.key === requirement.key)).map((profile) => profile.label);
    const signal = neural * .55 + peerSites.length / Math.max(1, model.sites.length - 1) * .45;
    return { ...requirement, current: current.quantity, shortage: Math.max(0, requirement.required - current.quantity), peerSites: peerSites.length, peerQuantity, usedIn, signal };
  }).filter((item) => item.shortage > 0 && item.peerSites >= 2)
    .sort((a, b) => b.signal - a.signal || b.weight - a.weight || b.peerSites - a.peerSites)
    .slice(0, 3);

  const fingerprintGroups = [
    { label: '펌프', keywords: ['펌프', 'p/p', '양수기'] },
    { label: '검지', keywords: ['검지', '측정'] },
    { label: '인양', keywords: ['크레인', '블럭', '블록', '잭', '지게차'] },
    { label: '전원', keywords: ['발전기', '케이블', '용접기'] },
  ].map((group) => ({ ...group, quantity: Object.entries(inventory).filter(([name]) => group.keywords.some((keyword) => normalize(name).includes(normalize(keyword)))).reduce((sum, [, value]) => sum + value.quantity, 0) }));
  const fingerprintMax = Math.max(1, ...fingerprintGroups.map((item) => item.quantity));

  return (
    <main className="recover-page" style={{ '--grid-accent': accents[siteIndex % accents.length] } as CSSProperties}>
      <header className="candidate-header recover-header">
        <a className="candidate-brand" href="/"><span>ON</span>현장ON</a>
        <CandidateNav active="recover" compact />
        <small>한국가스기술공사 · 2026.05</small>
      </header>

      <section className="rg-hero">
        <div><span>긴급 출동</span><h1>긴급복구장비</h1><p>가스 검지기·펌프·발전기·크레인처럼 사고 직후 현장을 통제하고 복구하는 장비입니다. 사업장 보유 목록 350건으로 부족 장비와 지원처를 찾습니다.</p></div>
        <div className="rg-selector">
          <label>확인할 사업장<select value={site} onChange={(event) => setSite(event.target.value)}>{model.sites.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>사고 상황<select value={incident} onChange={(event) => setIncident(event.target.value as IncidentKey)}>{Object.entries(incidents).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        </div>
      </section>

      <div className="page-howto recover-howto"><strong>{incidentProfile.label}</strong><span>{incidentProfile.description}</span><i>→</i><span>보유 수량·부족 장비·지원 사업장을 바로 확인</span></div>

      <section className="incident-brief" aria-label={`${incidentProfile.label} 대응 설명`}>
        <div><small>상황</small><strong>{incidentProfile.description}</strong></div>
        <div><small>위험 요인</small><strong>{incidentProfile.danger}</strong></div>
        <div className="incident-sequence"><small>초동 조치</small><strong>{incidentProfile.firstResponse}</strong></div>
        <p><b>주의사항</b>{incidentProfile.decision}</p>
      </section>

      <section className="rg-status">
        <div className="readiness-card">
          <div className="readiness-ring" style={{ background: `conic-gradient(var(--grid-accent) ${readiness}%, #e2e7e3 ${readiness}% 100%)` }}><div><strong>{readiness}</strong><span>%</span><small>장비 준비율</small></div></div>
          <div className="readiness-card-proof"><strong>계산 기준</strong><p>기능 중요도와 최소수량 충족률을 함께 반영합니다.</p><span>중요도 × (보유수량 ÷ 최소수량)</span><small>최소수량 초과분은 제외</small></div>
        </div>
        <div className="rg-site-summary"><span>{site}</span><h2>{incidentProfile.label}</h2><div><p><small>보유 장비 종류</small><strong>{data.emergencyEquipment.bySite[site]?.items || 0}<em>종</em></strong></p><p><small>전체 보유 수량</small><strong>{data.emergencyEquipment.bySite[site]?.quantity || 0}<em>대</em></strong></p><p><small>부족 장비군</small><strong>{transfers.length}<em>개</em></strong></p></div><p className="readiness-summary"><b>부족 장비군</b>은 선택한 사고에 필요한 장비 중 실제 보유량이 최소수량보다 적은 항목입니다. 장비명이 달라도 같은 기능이면 한 장비군으로 합칩니다.</p></div>
        <div className="rg-fingerprint"><span>보유 구성</span>{fingerprintGroups.map((item) => <div key={item.label}><small>{item.label}</small><i><b style={{ width: `${Math.round(item.quantity / fingerprintMax * 100)}%` }} /></i><strong>{item.quantity}</strong></div>)}</div>
      </section>

      <section className="rg-main-grid">
        <div className="dispatch-kit">
          <div className="rg-title"><h2>필요 장비</h2><small>{site.replace('지사', '')} · {incidentProfile.label}</small></div>
          <p className="section-help"><b>검지</b>는 눈에 보이지 않는 가스나 산소 농도를 측정기로 확인한다는 뜻입니다. 띄어쓰기·영문명이 다른 장비도 같은 기능이면 한 장비군으로 합쳤습니다.</p>
          <div className="kit-columns kit-columns-wide"><span>장비</span><span>용도</span><span>보유 / 최소</span><span>충족</span></div>
          {kit.map((item) => {
            const coverage = Math.min(item.quantity / item.required, 1);
            return <div className="kit-row kit-row-wide" key={item.key}><strong>{item.label}<small>{item.names.slice(0, 2).join(' · ') || '해당 장비 없음'}</small></strong><span>{item.purpose}</span><b>{item.quantity} / {item.required}</b><em className={coverage >= 1 ? 'kit-ready' : 'kit-missing'}>{coverage >= 1 ? '충족' : `${item.required - item.quantity}대 부족`}</em></div>;
          })}
        </div>

        <div className="transfer-board">
          <div className="rg-title"><h2>장비 지원</h2><small>{site.replace('지사', '')}로 옮기는 장비</small></div>
          <div className="support-legend"><span>보내는 곳</span><i>→</i><span>받는 곳</span><b>지원 후 재고</b></div>
          <div className="support-plan-strip">
            <div><small>필요 장비</small><strong>{transfers.length}<em>종</em></strong></div>
            <div><small>보내는 사업장</small><strong>{supportSites.length}<em>곳</em></strong></div>
            <div><small>옮기는 수량</small><strong>{transferUnits}<em>대</em></strong></div>
            <div className={depletedDonors ? 'plan-warning' : ''}><small>지원 뒤 재고 0</small><strong>{depletedDonors}<em>건</em></strong></div>
          </div>
          <div className="support-route-list">{supportPlan.map((item) => {
            const moved = item.selected ? Math.min(item.shortage, item.selected.quantity) : 0;
            const unresolved = Math.max(0, item.shortage - moved);
            return <article className="support-route" key={item.key}>
              <header><div><small>필요</small><strong>{item.label} {item.shortage}대</strong></div><span className={item.selected?.safeAfter ? 'route-safe' : 'route-check'}>{item.selected?.safeAfter ? '지원 후 여유' : '재고 확인'}</span></header>
              {item.selected ? <>
                <div className="support-route-flow">
                  <div><small>보내는 곳</small><strong>{item.selected.site.replace('지사', '')}</strong><span>현재 {item.selected.quantity}대</span></div>
                  <p><b>{moved}대</b><i>→</i><small>지원</small></p>
                  <div><small>받는 곳</small><strong>{site.replace('지사', '')}</strong><span>{item.quantity}대 → {item.quantity + moved}대</span></div>
                </div>
                <footer><span>{item.selected.site.replace('지사', '')}에 {item.selected.remaining}대 남음</span><span>{unresolved ? `${unresolved}대 추가 확보 필요` : '필요수량 충족'}</span><span>추가 지원처 {item.backup ? `${item.backup.site.replace('지사', '')} ${item.backup.quantity}대` : '없음'}</span></footer>
              </> : <p className="route-empty">다른 사업장에도 확인 가능한 장비가 없습니다.</p>}
            </article>;
          })}</div>
          {transfers.length === 0 && <p className="rg-empty">이 상황의 최소 장비세트를 모두 충족합니다.</p>}
          <div className="support-outcome"><small>지원 반영</small><strong>부족 장비군 {transfers.length}개 → {supportedKit.filter((item) => item.quantity < item.required).length}개</strong><p>표시된 수량을 지원받는다고 가정하면 준비율은 {readiness}%에서 {supportedReadiness}%로 바뀝니다.</p></div>
        </div>
      </section>

      <section className="balance-lab">
        <div className="balance-copy"><span>실제 수량</span><h2>재배치 전후</h2></div>
        <div className="balance-metrics">
          <div><small>{site.replace('지사', '')} 준비율</small><p><strong>{readiness}%</strong><i>→</i><strong>{supportedReadiness}%</strong></p></div>
          <div><small>지원처 최저 준비율</small><p><strong>{supportFloorBefore === null ? '-' : `${supportFloorBefore}%`}</strong><i>→</i><strong>{supportFloorAfter === null ? '-' : `${supportFloorAfter}%`}</strong></p></div>
          <div><small>전체 부족 장비군</small><p><strong>{companyGapsBefore}개</strong><i>→</i><strong>{companyGapsAfter}개</strong></p></div>
        </div>
        <div className={keepsDonorReady ? 'balance-check balance-safe' : 'balance-check balance-warning'}><small>지원처 재고</small><strong>{supportSites.length === 0 ? '지원 불필요' : keepsDonorReady ? '최소수량 유지' : '확인 필요'}</strong></div>
      </section>

      <section className="rg-model">
        <div className="rg-title"><h2>배치 공백</h2><small>딥러닝 배치 분석</small></div>
        <div className="placement-legend"><span>현재 부족</span><span>타 사업장 반복 보유</span><span>전체 사고유형</span></div>
        <div className="placement-cards">{learnedGaps.length ? learnedGaps.map((item, index) => <article key={item.key}><span>{String(index + 1).padStart(2, '0')}</span><div><small>다음 보완 장비</small><strong>{item.label}</strong><p>{item.usedIn.slice(0, 3).join(' · ')} 대응에 사용</p></div><div><small>현재</small><strong>{item.current}대</strong></div><div><small>다른 사업장</small><strong>{item.peerSites}곳 · {item.peerQuantity}대</strong></div></article>) : <p className="placement-empty">현재 공개데이터에서 추가로 확인할 장비 공백이 없습니다.</p>}</div>
        <div className="model-status"><span><i />학습 완료</span><p>공개데이터 350건 · 14개 사업장 · 59개 장비</p></div>
        <div className="rg-model-metrics"><div><small>학습 데이터</small><strong>{number.format(model.data.records)}건</strong></div><div><small>학습 사례</small><strong>{number.format(model.data.trainPairs)}쌍</strong></div><div><small>검증 사례</small><strong>{number.format(model.data.testPairs)}쌍</strong></div><div><small>검증 정확도</small><strong>{(model.metrics.accuracy * 100).toFixed(1)}%</strong></div><div><small>분류 성능(AUC)</small><strong>{model.metrics.auc.toFixed(3)}</strong></div></div>
        <div className="model-use-tags"><b>적용</b><span>지원처 순서</span><span>보완 장비 순서</span><span>실제 수량 우선</span><span>담당자 최종 확인</span></div>
      </section>
    </main>
  );
}
