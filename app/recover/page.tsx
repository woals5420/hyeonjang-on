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
type Requirement = { key: string; label: string; purpose: string; risk: string; impact: string; required: number; weight: number; patterns: string[] };
type EquipmentStockItem = { name: string; quantity: number; locations: string[] };
type SupportCandidate = {
  site: string;
  quantity: number;
  names: string[];
  locations: string[];
  items: EquipmentStockItem[];
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

// Source: (주)한국가스기술공사_가스시설물 긴급복구장비 보유 목록_20260507
const siteDirectory: Record<string, { address: string; phone: string }> = {
  강원지사: { address: '강원도 원주시 단구동 423', phone: '033-760-7926' },
  경기지사: { address: '경기도 안산시 상록구 수인로 1248', phone: '031-400-7366' },
  광주전남지사: { address: '광주광역시 광산구 손재로 368-21', phone: '062-950-1448' },
  대구경북지사: { address: '경상북도 경산시 진량읍 공단6로 122', phone: '053-850-1979' },
  대전충청지사: { address: '대전광역시 중구 유등천동로 788', phone: '042-229-3644' },
  부산경남지사: { address: '경상남도 김해시 김해대로 2596번길 53', phone: '055-330-7862' },
  삼척기지지사: { address: '강원도 삼척시 원덕읍 호산해변길 18', phone: '033-571-4617' },
  서울지사: { address: '서울특별시 강서구 공항대로 340', phone: '02-2657-1722' },
  인천기지지사: { address: '인천광역시 연수구 인천신항대로 962', phone: '032-810-4758' },
  인천지사: { address: '인천광역시 서구 청라한내로 110', phone: '032-560-3717' },
  전북지사: { address: '전북 군산시 대야면 만자로 12', phone: '063-850-3922' },
  제주LNG지사: { address: '제주특별자치도 제주시 애월읍 애월해안로 59-38', phone: '064-766-5215' },
  통영기지지사: { address: '경상남도 통영시 광도면 안정로 770', phone: '055-640-6455' },
  평택기지지사: { address: '경기도 평택시 포승읍 남양만로 175-88', phone: '031-8012-9711' },
};

const sharedRequirements = {
  detector: { key: 'detector', label: '누출 농도 확인', purpose: '누출 위치와 농도 확인', risk: '누출 범위를 눈으로 판단', impact: '차단·환기 범위를 정하는 일이 늦어질 수 있습니다.', required: 2, weight: 3, patterns: ['가스검지', '메탄검지', 'fid'] },
  oxygen: { key: 'oxygen', label: '산소 농도 확인', purpose: '산소결핍 확인', risk: '산소결핍 여부 확인 불가', impact: '밀폐공간 진입 가능 여부를 판단하기 어렵습니다.', required: 1, weight: 3, patterns: ['산소검지', '산소농도측정'] },
  respirator: { key: 'respirator', label: '호흡 보호', purpose: '오염 구역 진입 보호', risk: '오염 구역 진입 보호수단 부족', impact: '누출원 차단과 구조 작업을 시작하기 어렵습니다.', required: 2, weight: 3, patterns: ['공기호흡기', '송기마스크'] },
  ventilation: { key: 'ventilation', label: '강제 환기', purpose: '가스·유해공기 배출', risk: '가스와 유해공기 체류', impact: '농도를 낮추고 안전구역을 확보하는 시간이 길어질 수 있습니다.', required: 1, weight: 2, patterns: ['송풍기', '배풍기'] },
  pump: { key: 'pump', label: '침수 배수', purpose: '침수수 배출', risk: '침수 범위 확대', impact: '설비 접근과 전기적 안전 확보가 늦어질 수 있습니다.', required: 2, weight: 3, patterns: ['수중펌프', '배수펌프', '양수기', '잠수p/p', '엔진p/p', '엔진펌프', '후렉시블펌프'] },
  generator: { key: 'generator', label: '비상 전원', purpose: '정전 중 장비 전원 공급', risk: '계측·조명·배수 장비 정지', impact: '현장 확인과 복구 작업을 이어가기 어렵습니다.', required: 1, weight: 3, patterns: ['발전기', '이동형전원장치'] },
  cable: { key: 'cable', label: '임시전원 연결', purpose: '이동형 장비 전원 연결', risk: '발전기 전원을 현장 장비에 전달 불가', impact: '발전기가 있어도 펌프·조명을 가동하기 어렵습니다.', required: 1, weight: 1, patterns: ['케이블릴', '케이블 릴'] },
  lighting: { key: 'lighting', label: '현장 조명', purpose: '야간·정전 시 시야 확보', risk: '작업구역 시야 부족', impact: '이동 중 넘어짐과 설비 오조작 위험을 줄이기 어렵습니다.', required: 1, weight: 1, patterns: ['비상조명', '투광기', '서치등'] },
  crane: { key: 'crane', label: '중량물 인양', purpose: '중량물 이동·회수', risk: '전도·협착 설비 이동 불가', impact: '작업반경 통제 뒤에도 구조와 설비 회수를 시작하기 어렵습니다.', required: 1, weight: 3, patterns: ['크레인', '기중기'] },
  hoist: { key: 'hoist', label: '정밀 인양·고정', purpose: '정밀 인양과 고정', risk: '하중 이중고정 수단 부족', impact: '2차 낙하를 막은 상태에서 정밀 인양하기 어렵습니다.', required: 2, weight: 2, patterns: ['체인블럭', '체인 블럭', '레버블럭', '레버 블럭'] },
  jack: { key: 'jack', label: '설비 틈새 확보', purpose: '설비 들어올림·간격 확보', risk: '협착 지점의 틈새 확보 불가', impact: '구조 공간을 만들거나 설비를 안정시키기 어렵습니다.', required: 2, weight: 2, patterns: ['유압잭', 'hydrojack'] },
  insulation: { key: 'insulation', label: '절연 상태 확인', purpose: '복전 전 절연 상태 확인', risk: '누전 여부 확인 없이 복전', impact: '감전과 설비 재손상 가능성을 확인하기 어렵습니다.', required: 1, weight: 2, patterns: ['절연저항', 'insulationtester'] },
  meter: { key: 'meter', label: '전압·전류 확인', purpose: '전압·전류 상태 확인', risk: '전기 상태 오판', impact: '안전한 전원 격리와 복전 시점을 정하기 어렵습니다.', required: 1, weight: 1, patterns: ['멀티메타', 'multimeter', '후크미터', 'hookmeter'] },
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
  const grouped = new Map<string, EquipmentStockItem>();
  rows.forEach((row) => {
    const item = grouped.get(row.equipment) || { name: row.equipment, quantity: 0, locations: [] };
    item.quantity += Math.max(0, row.quantity);
    if (row.location && !item.locations.includes(row.location)) item.locations.push(row.location);
    grouped.set(row.equipment, item);
  });
  const items = [...grouped.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'ko'));
  return {
    quantity: rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
    names: items.map((item) => item.name),
    locations: [...new Set(rows.map((row) => row.location).filter(Boolean))],
    items,
  };
}

function representativeEquipment(requirement: Requirement) {
  const grouped = new Map<string, { quantity: number; sites: Set<string> }>();
  data.emergencyEquipment.records.filter((row) => matches(row.equipment, requirement)).forEach((row) => {
    const item = grouped.get(row.equipment) || { quantity: 0, sites: new Set<string>() };
    item.quantity += Math.max(0, row.quantity);
    item.sites.add(row.site);
    grouped.set(row.equipment, item);
  });
  return [...grouped.entries()].sort((a, b) => b[1].sites.size - a[1].sites.size || b[1].quantity - a[1].quantity)[0]?.[0] || requirement.label;
}

function allocateEquipment(candidate: { items: EquipmentStockItem[] }, required: number) {
  let left = required;
  return candidate.items.map((item) => {
    const moved = Math.min(left, item.quantity);
    left -= moved;
    return { ...item, moved, remaining: item.quantity - moved };
  }).filter((item) => item.moved > 0);
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
  const unresolvedShortages = supportedKit.filter((item) => item.quantity < item.required).length;
  const newDonorShortages = supportPlan.filter((item) => item.selected && item.selected.quantity >= item.required && item.selected.remaining < item.required).length;
  const supportEquipment = supportPlan.flatMap((item) => {
    if (!item.selected) return [];
    const allocations = allocateEquipment(item.selected, item.shortage);
    const totalMoved = allocations.reduce((sum, stock) => sum + stock.moved, 0);
    return allocations.map((stock) => ({
      ...stock,
      category: item.label,
      donor: item.selected!.site,
      donorCategoryBefore: item.selected!.quantity,
      donorCategoryAfter: item.selected!.remaining,
      destinationBefore: item.quantity,
      destinationAfter: item.quantity + totalMoved,
    }));
  });
  const supportDecision = supportPlan.length === 0 ? '지원 불필요' : unresolvedShortages > 0 ? '추가 장비 필요' : newDonorShortages > 0 ? '지원처 재고 확인' : '지원 협의 가능';
  const supportDecisionCopy = supportPlan.length === 0
    ? '선택한 사고에 필요한 최소수량을 현재 사업장이 이미 보유하고 있습니다.'
    : unresolvedShortages > 0
      ? `지원안을 적용해도 ${unresolvedShortages}종의 필요수량이 남습니다.`
      : newDonorShortages > 0
        ? `받는 지사의 부족은 해결되지만 보내는 지사에 ${newDonorShortages}종의 새 부족이 생깁니다.`
        : '받는 지사의 부족을 채우면서 보내는 지사의 최소수량도 유지합니다.';

  const allRequirements = Object.values(sharedRequirements) as Requirement[];
  const learnedGaps = allRequirements.map((requirement) => {
    const current = inventoryFor(site, requirement);
    const learnedNames = model.equipment.filter((name) => matches(name, requirement));
    const neural = learnedNames.length ? learnedNames.reduce((sum, name) => sum + compatibility(site, name), 0) / learnedNames.length : 0;
    const shortage = Math.max(0, requirement.required - current.quantity);
    const peerStocks = model.sites.filter((targetSite) => targetSite !== site).map((targetSite) => ({ site: targetSite, ...inventoryFor(targetSite, requirement) }))
      .filter((item) => item.quantity > 0)
      .sort((a, b) => Number(b.quantity - shortage >= requirement.required) - Number(a.quantity - shortage >= requirement.required) || b.quantity - a.quantity);
    const donor = peerStocks[0];
    const allocations = donor ? allocateEquipment(donor, shortage) : [];
    const moved = allocations.reduce((sum, item) => sum + item.moved, 0);
    const usedIn = Object.values(incidents).filter((profile) => profile.requirements.some((item) => item.key === requirement.key)).map((profile) => profile.label);
    const signal = neural * .55 + peerStocks.length / Math.max(1, model.sites.length - 1) * .45;
    return { ...requirement, current: current.quantity, shortage, peerSites: peerStocks.length, donor, allocations, moved, usedIn, signal };
  }).filter((item) => item.shortage > 0 && item.peerSites >= 2 && item.donor)
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
          <p className="section-help">큰 글자는 <b>한국가스기술공사 원자료의 실제 장비명</b>입니다. 작은 글자는 장비가 맡는 기능입니다.</p>
          <div className="kit-columns kit-columns-wide"><span>장비</span><span>용도</span><span>보유 / 최소</span><span>충족</span></div>
          {kit.map((item) => {
            const coverage = Math.min(item.quantity / item.required, 1);
            return <div className="kit-row kit-row-wide" key={item.key}><strong>{item.names.slice(0, 2).join(' · ') || representativeEquipment(item)}<small>{item.label}</small></strong><span>{item.purpose}</span><b>{item.quantity} / {item.required}</b><em className={coverage >= 1 ? 'kit-ready' : 'kit-missing'}>{coverage >= 1 ? '충족' : `${item.required - item.quantity}대 부족`}</em></div>;
          })}
        </div>

        <div className="transfer-board">
          <div className="rg-title"><h2>장비 지원</h2><small>실제 장비명 · 실제 보유수량</small></div>
          <p className="section-help">부족 장비가 대응에 미치는 영향과 빌릴 수 있는 사업장을 함께 봅니다. <b>도로 이동시간은 원자료에 없어 산정값을 넣지 않았습니다.</b></p>
          <div className="support-plan-strip">
            <div><small>필요 장비</small><strong>{transfers.length}<em>종</em></strong></div>
            <div><small>보내는 사업장</small><strong>{supportSites.length}<em>곳</em></strong></div>
            <div><small>옮기는 수량</small><strong>{transferUnits}<em>대</em></strong></div>
            <div className={depletedDonors ? 'plan-warning' : ''}><small>지원 뒤 재고 0</small><strong>{depletedDonors}<em>건</em></strong></div>
          </div>
          <div className="support-route-list">{supportPlan.map((item) => {
            const moved = item.selected ? Math.min(item.shortage, item.selected.quantity) : 0;
            const unresolved = Math.max(0, item.shortage - moved);
            const allocations = item.selected ? allocateEquipment(item.selected, item.shortage) : [];
            const equipmentLine = allocations.map((stock) => `${stock.name} ${stock.moved}대`).join(' · ') || representativeEquipment(item);
            const locationLine = [...new Set(allocations.flatMap((stock) => stock.locations))].join(' · ') || '보유장소 확인 필요';
            const donorInfo = item.selected ? siteDirectory[item.selected.site] : undefined;
            return <article className="support-route" key={item.key}>
              <header><div><small>{item.label}</small><strong>{equipmentLine}</strong></div><span className={item.selected?.safeAfter ? 'route-safe' : 'route-check'}>{item.selected?.safeAfter ? '지원 후 최소수량 유지' : '지원처 재고 확인'}</span></header>
              {item.selected ? <>
                <div className="support-impact"><b>장비가 없으면</b><strong>{item.risk}</strong><span>{item.impact}</span></div>
                <div className="support-route-flow">
                  <div><small>보내는 곳</small><strong>{item.selected.site}</strong><span>{allocations.map((stock) => `${stock.name} ${stock.quantity}대`).join(' · ')}</span></div>
                  <p><b>{moved}대</b><i>→</i><small>지원</small></p>
                  <div><small>받는 곳</small><strong>{site}</strong><span>{item.quantity}대 → {item.quantity + moved}대</span></div>
                </div>
                <div className="support-route-detail">
                  <div><small>출발지</small><strong>{donorInfo?.address || '주소 확인 필요'}</strong><span>{donorInfo ? `연락 ${donorInfo.phone}` : ''}</span></div>
                  <div className="route-time"><small>예상 도착</small><strong>도로시간 미연동</strong><span>공개데이터에 지사 간 이동시간 없음</span></div>
                </div>
                <footer><span>보유장소 {locationLine}</span>{allocations.map((stock) => <span key={stock.name}>지원 후 {item.selected?.site} {stock.name} {stock.remaining}대</span>)}<span>{unresolved ? `${unresolved}대 추가 확보 필요` : '받는 지사 필요수량 충족'}</span><span>다른 보유처 {item.backup ? `${item.backup.site} · ${item.backup.names.slice(0, 2).join('·')} ${item.backup.quantity}대` : '없음'}</span></footer>
              </> : <p className="route-empty">다른 사업장에도 확인 가능한 장비가 없습니다.</p>}
            </article>;
          })}</div>
          {transfers.length === 0 && <p className="rg-empty">이 상황의 최소 장비세트를 모두 충족합니다.</p>}
          <div className="support-outcome"><small>지원 결과</small><strong>{unresolvedShortages ? `${unresolvedShortages}종 추가 확보 필요` : `${incidentProfile.label} 필요수량 충족`}</strong><p>{transferUnits}대를 지원받은 뒤 보내는 지사에 새 부족이 생기는지 아래에서 확인합니다.</p></div>
        </div>
      </section>

      <section className="support-check">
        <div className="support-check-copy"><span>지원 결정</span><h2>지원안 점검</h2><p>장비를 보낸 뒤 양쪽 사업장의 필요수량을 다시 확인합니다.</p></div>
        <div className="support-check-metrics">
          <div><small>받는 지사</small><strong>{site}</strong><p>{supportEquipment.length ? supportEquipment.map((item) => `${item.name} ${item.destinationBefore}→${item.destinationAfter}대`).join(' · ') : '현재 부족 없음'}</p></div>
          <div><small>보내는 지사</small><strong>{supportSites.join(' · ') || '-'}</strong><p>{supportEquipment.length ? supportEquipment.map((item) => `${item.name} ${item.quantity}→${item.remaining}대 · ${item.category} 전체 ${item.donorCategoryBefore}→${item.donorCategoryAfter}대`).join(' · ') : '이동 장비 없음'}</p></div>
          <div><small>보내는 지사에 새 부족</small><strong>{newDonorShortages}<em>종</em></strong><p>지원 뒤 최소수량 미달</p></div>
          <div><small>받는 지사에 남은 부족</small><strong>{unresolvedShortages}<em>종</em></strong><p>지원 뒤에도 최소수량 미달</p></div>
        </div>
        <div className={newDonorShortages || unresolvedShortages ? 'support-check-result check-warning' : 'support-check-result check-safe'}><small>판정</small><strong>{supportDecision}</strong><p>{supportDecisionCopy}</p></div>
      </section>

      <section className="rg-model">
        <div className="rg-title"><h2>추가 확보</h2><small>{learnedGaps.length}종 확인</small></div>
        <p className="section-help">현재 사업장에 없거나 최소수량이 부족한 장비입니다. AI는 다른 사업장의 반복 보유 패턴을 학습해 <b>확인 순서만 정하고</b>, 아래 장비명·주소·수량·보유장소는 원자료를 그대로 씁니다.</p>
        <div className="placement-cards">{learnedGaps.length ? learnedGaps.map((item, index) => {
          const donor = item.donor!;
          const donorInfo = siteDirectory[donor.site];
          const equipmentLine = item.allocations.map((stock) => `${stock.name} ${stock.moved}대`).join(' · ');
          return <article key={item.key}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <header><small>{item.label}</small><strong>{equipmentLine}</strong><p>{item.usedIn.slice(0, 3).join(' · ')} 대응</p></header>
            <div className="placement-risk"><small>없을 때</small><strong>{item.risk}</strong><p>{item.impact}</p></div>
            <div className="placement-route"><small>보유 지사</small><strong>{donor.site}</strong><p>{donorInfo?.address || '주소 확인 필요'}</p><span>{donorInfo ? `연락 ${donorInfo.phone}` : ''}</span></div>
            <div className="placement-balance"><small>지원 전 → 지원 후</small><strong>{item.allocations.map((stock) => `${stock.name} ${stock.quantity}대 → ${stock.remaining}대`).join(' · ')}</strong><p>{site} {item.current}대 → {item.current + item.moved}대</p></div>
            <div className="placement-time"><small>예상 도착</small><strong>도로시간 미연동</strong><p>주소는 제공되지만 이동시간 데이터는 없습니다.</p></div>
          </article>;
        }) : <p className="placement-empty">현재 공개데이터에서 추가로 확인할 장비가 없습니다.</p>}</div>
        <div className="model-status"><span><i />AI 학습 완료</span><p>장비 보유 350건 · 14개 사업장 · 59개 장비명을 학습해 추가 확보 장비와 지원처의 확인 순서를 계산했습니다.</p></div>
        <div className="rg-model-metrics"><div><small>학습 데이터</small><strong>{number.format(model.data.records)}건</strong></div><div><small>학습 사례</small><strong>{number.format(model.data.trainPairs)}쌍</strong></div><div><small>검증 사례</small><strong>{number.format(model.data.testPairs)}쌍</strong></div><div><small>검증 정확도</small><strong>{(model.metrics.accuracy * 100).toFixed(1)}%</strong></div><div><small>분류 성능(AUC)</small><strong>{model.metrics.auc.toFixed(3)}</strong></div></div>
        <div className="model-use-tags"><b>AI 사용 범위</b><span>추가 확보 순서</span><span>지원처 후보 순서</span><span>수량·주소는 원자료</span><span>이동시간 제외</span></div>
      </section>
    </main>
  );
}
