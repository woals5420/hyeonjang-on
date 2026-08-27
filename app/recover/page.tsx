'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import CandidateNav from '../components/CandidateNav';
import safetyData from '../data/kgtc-safety.json';

type EquipmentRecord = { site: string; equipment: string; quantity: number; location: string };
type Data = { emergencyEquipment: { records: EquipmentRecord[]; bySite: Record<string, { items: number; quantity: number }> } };
type Requirement = { key: string; label: string; purpose: string; risk: string; impact: string; required: number; weight: number; patterns: string[] };
type EquipmentStockItem = { name: string; quantity: number; locations: string[] };
type SupportCandidate = {
  site: string;
  quantity: number;
  names: string[];
  locations: string[];
  items: EquipmentStockItem[];
  stockCoverage: number;
  remaining: number;
  safeAfter: boolean;
  distanceKm: number;
};

const data = safetyData as Data;
const sites = [...new Set(data.emergencyEquipment.records.map((row) => row.site))].sort((a, b) => a.localeCompare(b, 'ko'));
const equipmentTypeCount = new Set(data.emergencyEquipment.records.map((row) => row.equipment)).size;
const emergencySource = 'https://www.data.go.kr/data/15012412/fileData.do';
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

// 공개 주소의 위치를 지사 간 직선거리 비교용으로만 사용합니다. 지도·교통 API를 호출하지 않습니다.
const siteCoordinates: Record<string, { lat: number; lng: number }> = {
  강원지사: { lat: 37.327, lng: 127.952 },
  경기지사: { lat: 37.294, lng: 126.863 },
  광주전남지사: { lat: 35.175, lng: 126.807 },
  대구경북지사: { lat: 35.858, lng: 128.819 },
  대전충청지사: { lat: 36.327, lng: 127.414 },
  부산경남지사: { lat: 35.235, lng: 128.884 },
  삼척기지지사: { lat: 37.176, lng: 129.338 },
  서울지사: { lat: 37.558, lng: 126.837 },
  인천기지지사: { lat: 37.351, lng: 126.607 },
  인천지사: { lat: 37.533, lng: 126.652 },
  전북지사: { lat: 35.951, lng: 126.812 },
  제주LNG지사: { lat: 33.474, lng: 126.354 },
  통영기지지사: { lat: 34.948, lng: 128.414 },
  평택기지지사: { lat: 36.975, lng: 126.849 },
};

function straightDistance(from: string, to: string) {
  const start = siteCoordinates[from];
  const end = siteCoordinates[to];
  if (!start || !end) return Number.POSITIVE_INFINITY;
  const radius = 6371;
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(end.lat - start.lat);
  const longitude = radians(end.lng - start.lng);
  const haversine = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(start.lat)) * Math.cos(radians(end.lat)) * Math.sin(longitude / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

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
  const siteIndex = Math.max(0, sites.indexOf(site));
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
  const positiveEquipmentTypes = Object.values(inventory).filter((item) => item.quantity > 0).length;

  const kit = requirements.map((requirement) => ({ ...requirement, ...inventoryFor(site, requirement) }));
  const readiness = readinessFor(kit);

  const transfers = kit.map((needed) => {
    const shortage = Math.max(0, needed.required - needed.quantity);
    const candidates: SupportCandidate[] = sites.filter((candidate) => candidate !== site).map((candidate) => {
      const stock = inventoryFor(candidate, needed);
      const stockCoverage = shortage > 0 ? Math.min(stock.quantity / shortage, 1) : 1;
      const remaining = Math.max(0, stock.quantity - shortage);
      const safeAfter = stock.quantity >= shortage && remaining >= needed.required;
      const distanceKm = straightDistance(site, candidate);
      return { site: candidate, ...stock, stockCoverage, remaining, safeAfter, distanceKm };
    }).filter((candidate) => candidate.quantity > 0)
      .sort((a, b) => Number(b.safeAfter) - Number(a.safeAfter) || a.distanceKm - b.distanceKm || b.quantity - a.quantity);
    return { ...needed, shortage, candidates };
  }).filter((item) => item.shortage > 0);

  const supportPlan = transfers.map((transfer) => {
    const safeCandidates = transfer.candidates.filter((candidate) => candidate.quantity >= transfer.shortage && candidate.safeAfter);
    const selected = safeCandidates[0];
    const backup = safeCandidates[1];
    return { ...transfer, selected, backup };
  }).sort((a, b) => b.weight * b.shortage - a.weight * a.shortage);
  const supportSites = [...new Set(supportPlan.map((item) => item.selected?.site).filter((item): item is string => Boolean(item)))];
  const transferUnits = supportPlan.reduce((sum, item) => sum + (item.selected ? Math.min(item.shortage, item.selected.quantity) : 0), 0);

  const supportedKit = kit.map((item) => {
    const support = supportPlan.find((transfer) => transfer.key === item.key)?.selected;
    return { ...item, quantity: item.quantity + (support ? Math.min(support.quantity, Math.max(0, item.required - item.quantity)) : 0) };
  });
  const supportedReadiness = readinessFor(supportedKit);
  const unresolvedShortages = supportedKit.filter((item) => item.quantity < item.required).length;
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
  const donorBalanceText = [...new Map(supportEquipment.map((item) => [
    `${item.donor}-${item.category}`,
    `${item.donor} ${item.category} 합계 ${item.donorCategoryBefore}→${item.donorCategoryAfter}대`,
  ])).values()].join(' · ');
  const supportDecision = supportPlan.length === 0 ? '추가 이동 불필요' : unresolvedShortages > 0 ? '지원 후보 없음' : '수량상 지원 후보 확인';
  const supportDecisionCopy = supportPlan.length === 0
    ? '선택한 대응 기준수량을 현재 사업장이 이미 보유하고 있습니다.'
    : unresolvedShortages > 0
      ? `${unresolvedShortages}종은 다른 사업장의 기준수량을 남기면서 보낼 수 있는 후보가 없습니다.`
      : '수량 조건을 만족하는 후보 중 공개 주소의 직선거리가 가장 가까운 사업장을 표시했습니다.';

  const allRequirements = Object.values(sharedRequirements) as Requirement[];
  const readinessGaps = allRequirements.map((requirement) => {
    const current = inventoryFor(site, requirement);
    const shortage = Math.max(0, requirement.required - current.quantity);
    const peerStocks = sites.filter((targetSite) => targetSite !== site).map((targetSite) => {
      const stock = inventoryFor(targetSite, requirement);
      return { site: targetSite, ...stock, distanceKm: straightDistance(site, targetSite), safeAfter: stock.quantity >= shortage + requirement.required };
    })
      .filter((item) => item.quantity > 0)
      .sort((a, b) => Number(b.safeAfter) - Number(a.safeAfter) || a.distanceKm - b.distanceKm || b.quantity - a.quantity);
    const donor = peerStocks.find((item) => item.safeAfter);
    const allocations = donor ? allocateEquipment(donor, shortage) : [];
    const moved = allocations.reduce((sum, item) => sum + item.moved, 0);
    const usedIn = Object.values(incidents).filter((profile) => profile.requirements.some((item) => item.key === requirement.key)).map((profile) => profile.label);
    return { ...requirement, current: current.quantity, shortage, peerSites: peerStocks.length, donor, allocations, moved, usedIn };
  }).filter((item) => item.shortage > 0 && item.peerSites >= 2 && item.donor)
    .sort((a, b) => b.usedIn.length - a.usedIn.length || b.weight - a.weight || a.donor!.distanceKm - b.donor!.distanceKm)
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
        <div><span>긴급 출동</span><h1>긴급복구장비</h1><p>가스 검지기·펌프·발전기·크레인처럼 사고 직후 현장을 통제하고 복구하는 장비입니다. 공개 보유목록의 수량을 비교해 다른 사업장에서 받을 수 있는 장비 후보를 찾습니다.</p></div>
        <div className="rg-selector">
          <label>확인할 사업장<select value={site} onChange={(event) => setSite(event.target.value)}>{sites.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>대응 상황 <small>기획 기준</small><select value={incident} onChange={(event) => setIncident(event.target.value as IncidentKey)}>{Object.entries(incidents).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        </div>
      </section>

      <div className="page-howto recover-howto"><strong>{incidentProfile.label}</strong><span>{incidentProfile.description}</span><i>→</i><span>실시간 출동상태가 아닌 공개 보유수량 비교</span></div>

      <section className="incident-brief" aria-label={`${incidentProfile.label} 대응 설명`}>
        <div><small>상황</small><strong>{incidentProfile.description}</strong></div>
        <div><small>위험 요인</small><strong>{incidentProfile.danger}</strong></div>
        <div className="incident-sequence"><small>초동 조치</small><strong>{incidentProfile.firstResponse}</strong></div>
        <p><b>주의사항</b>{incidentProfile.decision}</p>
      </section>

      <section className="rg-status">
        <div className="readiness-card">
          <div className="readiness-ring" style={{ background: `conic-gradient(var(--grid-accent) ${readiness}%, #e2e7e3 ${readiness}% 100%)` }}><div><strong>{readiness}</strong><span>%</span><small>장비 충족률</small></div></div>
          <div className="readiness-card-proof"><strong>장비 충족률 계산</strong><p>선택 상황에 필요한 기능별 기준수량과 공개 보유수량을 비교합니다.</p><span>기능 중요도 × 수량 충족률</span><small>공식 보유기준이 아닌 기획용 비교값</small></div>
        </div>
        <div className="rg-site-summary"><span>{site}</span><h2>{incidentProfile.label}</h2><div><p><small>실보유 장비 종류</small><strong>{positiveEquipmentTypes}<em>종</em></strong></p><p><small>전체 보유 수량</small><strong>{data.emergencyEquipment.bySite[site]?.quantity || 0}<em>대</em></strong></p><p><small>확인할 장비군</small><strong>{transfers.length}<em>개</em></strong></p></div><p className="readiness-summary"><b>확인할 장비군</b>은 선택한 대응 상황의 기준수량보다 실제 보유량이 적은 항목입니다. 장비명이 달라도 같은 기능이면 한 장비군으로 합칩니다.</p></div>
        <div className="rg-fingerprint"><span>보유 구성</span>{fingerprintGroups.map((item) => <div key={item.label}><small>{item.label}</small><i><b style={{ width: `${Math.round(item.quantity / fingerprintMax * 100)}%` }} /></i><strong>{item.quantity}</strong></div>)}</div>
      </section>

      <section className="rg-main-grid">
        <div className="dispatch-kit">
          <div className="rg-title"><h2>필요 장비</h2><small>{site.replace('지사', '')} · {incidentProfile.label}</small></div>
          <p className="section-help">큰 글자는 <b>한국가스기술공사 원자료의 실제 장비명</b>입니다. 작은 글자는 장비가 맡는 기능입니다. 기준수량은 화면 비교를 위한 기획 기준이며 공사의 공식 배치기준이 아닙니다. <a href={emergencySource} target="_blank" rel="noreferrer">원문 ↗</a></p>
          <div className="kit-columns kit-columns-wide"><span>장비</span><span>용도</span><span>보유 / 기준</span><span>충족</span></div>
          {kit.map((item) => {
            const coverage = Math.min(item.quantity / item.required, 1);
            return <div className="kit-row kit-row-wide" key={item.key}><strong>{item.names.slice(0, 2).join(' · ') || representativeEquipment(item)}<small>{item.label}</small></strong><span>{item.purpose}</span><b>{item.quantity} / {item.required}</b><em className={coverage >= 1 ? 'kit-ready' : 'kit-missing'}>{coverage >= 1 ? '충족' : `${item.required - item.quantity}대 부족`}</em></div>;
          })}
        </div>

        <div className="transfer-board">
          <div className="rg-title"><h2>장비 지원</h2><small>실제 장비명 · 실제 보유수량</small></div>
          <p className="section-help">필요수량을 보내고도 같은 기능의 기준수량이 남는 사업장만 추린 뒤, <b>공개 주소 기준 직선거리가 가장 가까운 곳</b>을 표시합니다. 실제 보관 위치·점검 상태·교통시간은 반영하지 않습니다.</p>
          <div className="support-plan-strip">
            <div><small>필요 장비</small><strong>{transfers.length}<em>종</em></strong></div>
            <div><small>보내는 사업장</small><strong>{supportSites.length}<em>곳</em></strong></div>
            <div><small>옮기는 수량</small><strong>{transferUnits}<em>대</em></strong></div>
            <div><small>선정 기준</small><strong>직선거리<em>· 잔여수량</em></strong></div>
          </div>
          <div className="support-route-list">{supportPlan.map((item) => {
            const moved = item.selected ? Math.min(item.shortage, item.selected.quantity) : 0;
            const unresolved = Math.max(0, item.shortage - moved);
            const allocations = item.selected ? allocateEquipment(item.selected, item.shortage) : [];
            const equipmentLine = allocations.map((stock) => `${stock.name} ${stock.moved}대`).join(' · ') || representativeEquipment(item);
            const locationLine = [...new Set(allocations.flatMap((stock) => stock.locations))].join(' · ') || '보유장소 확인 필요';
            const donorInfo = item.selected ? siteDirectory[item.selected.site] : undefined;
            return <article className="support-route" key={item.key}>
              <header><div><small>{item.label}</small><strong>{equipmentLine}</strong></div><span className={item.selected?.safeAfter ? 'route-safe' : 'route-check'}>{item.selected ? `직선거리 약 ${item.selected.distanceKm}km · 기준수량 유지` : '지원 후보 없음'}</span></header>
              {item.selected ? <>
                <div className="support-impact"><b>장비가 없으면</b><strong>{item.risk}</strong><span>{item.impact}</span></div>
                <div className="support-route-flow">
                  <div><small>보내는 곳</small><strong>{item.selected.site}</strong><span>{allocations.map((stock) => `${stock.name} ${stock.quantity}대`).join(' · ')}</span></div>
                  <p><b>{moved}대</b><i>→</i><small>지원</small></p>
                  <div><small>받는 곳</small><strong>{site}</strong><span>{item.quantity}대 → {item.quantity + moved}대</span></div>
                </div>
                <div className="support-route-detail">
                  <div><small>보내는 곳 주소</small><strong>{donorInfo?.address || '주소 확인 필요'}</strong><span>{donorInfo ? `연락 ${donorInfo.phone}` : ''}</span></div>
                  <div><small>받는 곳 주소</small><strong>{siteDirectory[site]?.address || '주소 확인 필요'}</strong><span>직선거리 비교 · 교통시간 아님</span></div>
                </div>
                <footer><span>보유장소 {locationLine}</span><span>{item.selected.site} {item.label} 합계 {item.selected.quantity}대 → {item.selected.remaining}대</span>{allocations.map((stock) => <span key={stock.name}>{stock.name} {stock.quantity}대 중 {stock.moved}대 이동</span>)}<span>{unresolved ? `${unresolved}대 별도 확보 필요` : '받는 사업장 기준수량 충족'}</span><span>다음 후보 {item.backup ? `${item.backup.site} · 약 ${item.backup.distanceKm}km · 기준수량 유지` : '없음'}</span></footer>
              </> : <p className="route-empty">다른 사업장에도 확인 가능한 장비가 없습니다.</p>}
            </article>;
          })}</div>
          {transfers.length === 0 && <p className="rg-empty">이 상황의 최소 장비세트를 모두 충족합니다.</p>}
          <div className="support-outcome"><small>수량 비교 결과</small><strong>{unresolvedShortages ? `${unresolvedShortages}종은 지원 후보 없음` : `${incidentProfile.label} 장비 기준 충족`}</strong><p>{unresolvedShortages ? '가까워도 보내는 사업장의 기준수량이 부족해지면 후보에서 제외합니다.' : '가장 가까운 후보에서 필요한 수량만 옮겼을 때 양쪽 사업장이 기획 기준을 충족합니다.'}</p></div>
        </div>
      </section>

      <section className="support-check">
        <div className="support-check-copy"><span>이동 전후</span><h2>지원 후보 검토</h2><p>장비를 옮긴다고 가정했을 때 양쪽 사업장의 수량을 다시 계산합니다.</p></div>
        <div className="support-check-metrics">
          <div><small>받는 곳 장비 충족률</small><strong>{readiness}% → {supportedReadiness}%</strong><p>{site} · {incidentProfile.label}</p></div>
          <div><small>이동 장비</small><strong>{transfers.length}종 · {transferUnits}대</strong><p>{supportEquipment.length ? supportEquipment.map((item) => `${item.name} ${item.destinationBefore}→${item.destinationAfter}대`).join(' · ') : '이동 장비 없음'}</p></div>
          <div><small>보내는 곳</small><strong>{supportSites.join(' · ') || '-'}</strong><p>{donorBalanceText || '추가 이동 불필요'}</p></div>
          <div><small>후보 선정</small><strong>수량 + 직선거리</strong><p>이동 후 기준수량을 유지하는 곳 중 공개 주소가 가장 가까운 사업장</p></div>
        </div>
        <div className={unresolvedShortages ? 'support-check-result check-warning' : 'support-check-result check-safe'}><small>판정</small><strong>{supportDecision}</strong><p>{supportDecisionCopy}</p></div>
      </section>

      <section className="rg-model">
        <div className="rg-title"><h2>평시 보완 후보</h2><small>{readinessGaps.length}종 확인</small></div>
        <p className="section-help">현재 선택한 사고와 별개로, 여러 대응 상황에 공통으로 쓰이지만 이 사업장에 부족한 장비를 보여줍니다. 다른 사업장의 공개 보유수량과 직선거리만 비교한 점검 목록입니다.</p>
        <div className="placement-cards">{readinessGaps.length ? readinessGaps.map((item, index) => {
          const donor = item.donor!;
          const donorInfo = siteDirectory[donor.site];
          const equipmentLine = item.allocations.map((stock) => `${stock.name} ${stock.moved}대`).join(' · ');
          return <article key={item.key}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <header><small>{item.label}</small><strong>{equipmentLine}</strong><p>{item.usedIn.slice(0, 3).join(' · ')} 대응</p></header>
            <div className="placement-risk"><small>없을 때</small><strong>{item.risk}</strong><p>{item.impact}</p></div>
            <div className="placement-route"><small>보유 지사</small><strong>{donor.site}</strong><p>{donorInfo?.address || '주소 확인 필요'}</p><span>{donorInfo ? `연락 ${donorInfo.phone}` : ''}</span></div>
            <div className="placement-balance"><small>지원 전 → 지원 후</small><strong>{item.allocations.map((stock) => `${stock.name} ${stock.quantity}대 → ${stock.remaining}대`).join(' · ')}</strong><p>{site} {item.current}대 → {item.current + item.moved}대</p></div>
            <div className="placement-time"><small>후보 기준</small><strong>직선거리 약 {donor.distanceKm}km</strong><p>이동 후 기획 기준수량 유지</p></div>
          </article>;
        }) : <p className="placement-empty">현재 공개데이터에서 추가로 확인할 장비가 없습니다.</p>}</div>
        <div className="rg-model-metrics"><div><small>공개 원자료</small><strong>{data.emergencyEquipment.records.length}건</strong></div><div><small>사업장</small><strong>{sites.length}곳</strong></div><div><small>실제 장비명</small><strong>{equipmentTypeCount}종</strong></div><div><small>비교 기준</small><strong>수량·거리</strong></div></div>
        <div className="model-use-tags"><b>확인 범위</b><span>보유수량: 원자료</span><span>이동 후보: 수량·직선거리</span><span>제외: 실시간 상태·교통</span><span>최종 판단: 담당자</span></div>
      </section>
    </main>
  );
}
