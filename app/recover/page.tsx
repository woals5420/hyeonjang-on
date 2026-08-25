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

function money(value: number) {
  if (value >= 1) return `${value.toFixed(value >= 10 ? 0 : 1)}억 원`;
  return `${Math.round(value * 10000).toLocaleString('ko-KR')}만 원`;
}

export default function RecoverGrid() {
  const [site, setSite] = useState('대전충청지사');
  const [incident, setIncident] = useState<IncidentKey>('leak');
  const [exposure, setExposure] = useState(10);
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
      const reserveScore = Math.min(remaining / Math.max(1, needed.required), 1);
      const rankValue = stockCoverage * 0.55 + reserveScore * 0.25 + neural * 0.2;
      return { site: candidate, ...stock, neural, stockCoverage, remaining, rankValue };
    }).filter((candidate) => candidate.quantity > 0)
      .sort((a, b) => b.rankValue - a.rankValue || b.quantity - a.quantity);
    return { ...needed, shortage, candidates };
  }).filter((item) => item.shortage > 0);

  const hubRanking = model.sites.filter((candidate) => candidate !== site).map((candidate) => {
    const available = transfers.map((transfer) => transfer.candidates.find((item) => item.site === candidate)).filter((item): item is SupportCandidate => Boolean(item));
    const fullCoverage = transfers.filter((transfer) => {
      const match = transfer.candidates.find((item) => item.site === candidate);
      return Boolean(match && match.quantity >= transfer.shortage);
    }).length;
    const averageRank = available.length ? available.reduce((sum, item) => sum + item.rankValue, 0) / available.length : 0;
    return { site: candidate, fullCoverage, averageRank };
  }).sort((a, b) => b.fullCoverage - a.fullCoverage || b.averageRank - a.averageRank);
  const supportHub = hubRanking[0]?.fullCoverage ? hubRanking[0].site : '';
  const supportPlan = transfers.map((transfer) => {
    const hubCandidate = transfer.candidates.find((candidate) => candidate.site === supportHub && candidate.quantity >= transfer.shortage);
    const selected = hubCandidate || transfer.candidates[0];
    const backup = transfer.candidates.find((candidate) => candidate.site !== selected?.site && candidate.quantity >= transfer.shortage) || transfer.candidates.find((candidate) => candidate.site !== selected?.site);
    return { ...transfer, selected, backup };
  });
  const supportSites = [...new Set(supportPlan.map((item) => item.selected?.site).filter((item): item is string => Boolean(item)))];
  const transferUnits = supportPlan.reduce((sum, item) => sum + (item.selected ? Math.min(item.shortage, item.selected.quantity) : 0), 0);
  const depletedDonors = supportPlan.filter((item) => item.selected && item.selected.remaining === 0).length;
  const priorityGap = [...supportPlan].sort((a, b) => b.weight * b.shortage - a.weight * a.shortage)[0];

  const supportedKit = kit.map((item) => {
    const support = supportPlan.find((transfer) => transfer.key === item.key)?.selected;
    return { ...item, quantity: item.quantity + (support ? Math.min(support.quantity, Math.max(0, item.required - item.quantity)) : 0) };
  });
  const supportedReadiness = readinessFor(supportedKit);
  const currentExposure = exposure * (100 - readiness) / 100;
  const supportedExposure = exposure * (100 - supportedReadiness) / 100;
  const protectedAmount = Math.max(0, currentExposure - supportedExposure);

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

      <div className="page-howto recover-howto"><strong>{incidentProfile.label}</strong><span>{incidentProfile.description}</span><i>→</i><span>보유 수량·미확보 기능·지원 사업장을 바로 확인</span></div>

      <section className="incident-brief" aria-label={`${incidentProfile.label} 대응 설명`}>
        <div><small>무슨 사고인가</small><strong>{incidentProfile.description}</strong></div>
        <div><small>가장 큰 위험</small><strong>{incidentProfile.danger}</strong></div>
        <div className="incident-sequence"><small>현장 도착 직후</small><strong>{incidentProfile.firstResponse}</strong></div>
        <p><b>판단 기준</b>{incidentProfile.decision}</p>
      </section>

      <section className="rg-status">
        <div className="readiness-card">
          <div className="readiness-ring" style={{ background: `conic-gradient(var(--grid-accent) ${readiness}%, #e2e7e3 ${readiness}% 100%)` }}><div><strong>{readiness}</strong><span>%</span><small>장비 준비율</small></div></div>
          <div className="readiness-card-proof"><strong>계산 기준</strong><p>기능 중요도와 최소수량 충족률을 함께 반영합니다.</p><span>중요도 × (보유수량 ÷ 최소수량)</span><small>최소수량 초과분은 제외</small></div>
        </div>
        <div className="rg-site-summary"><span>{site}</span><h2>{incidentProfile.label}</h2><div><p><small>보유 장비 종류</small><strong>{data.emergencyEquipment.bySite[site]?.items || 0}<em>종</em></strong></p><p><small>전체 보유 수량</small><strong>{data.emergencyEquipment.bySite[site]?.quantity || 0}<em>대</em></strong></p><p><small>미확보 기능군</small><strong>{transfers.length}<em>개</em></strong></p></div><p className="readiness-summary"><b>미확보 기능군</b>은 선택한 사고에 필요한 기능 중 실제 보유량이 최소수량보다 적은 항목입니다. 장비명이 달라도 같은 기능이면 한 장비군으로 합칩니다.</p></div>
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
          <div className="rg-title"><h2>장비 지원</h2><small>사업장별 보유수량 비교</small></div>
          <p className="section-help">필요한 수량을 보유한 다른 사업장을 찾습니다. 한 곳에서 여러 장비를 지원할 수 있으면 먼저 표시하고, 지원 후 그 사업장에 남는 수량도 함께 보여줍니다.</p>
          <div className="ai-plan-summary">
            <div><small>주 지원 사업장</small><strong>{supportHub ? supportHub.replace('지사', '') : '추가 확인'}</strong></div>
            <div><small>지원 사업장</small><strong>{supportSites.length}<em>곳</em></strong></div>
            <div><small>지원 수량</small><strong>{transferUnits}<em>대</em></strong></div>
            <div className={depletedDonors ? 'plan-warning' : ''}><small>지원 후 재고 0</small><strong>{depletedDonors}<em>건</em></strong></div>
          </div>
          {priorityGap && <p className="ai-priority"><b>우선 확보</b><strong>{priorityGap.label} {priorityGap.shortage}대</strong><span>사고 대응 중요도와 부족수량 기준</span></p>}
          <div className="support-columns"><span>필요 장비</span><span>지원 가능 사업장</span><span>보유 → 지원 후</span><span>추가 지원처</span></div>
          {supportPlan.map((item) => {
            const moved = item.selected ? Math.min(item.shortage, item.selected.quantity) : 0;
            const unresolved = Math.max(0, item.shortage - moved);
            return <div className="support-row" key={item.key}>
              <div><strong>{item.label}</strong><small>{item.shortage}대 지원 필요</small></div>
              {item.selected ? <>
                <div><strong>{item.selected.site.replace('지사', '')}</strong><small>{moved}대 지원 가능</small></div>
                <div><strong>{item.selected.quantity}대 → {item.selected.remaining}대</strong><small>{unresolved ? `${unresolved}대 추가 확인` : '필요수량 충족 가능'}</small></div>
                <div><strong>{item.backup ? item.backup.site.replace('지사', '') : '확인 필요'}</strong><small>{item.backup ? `${item.backup.quantity}대 보유` : '추가 지원처 없음'}</small></div>
              </> : <p>다른 사업장에도 확인 가능한 장비가 없습니다.</p>}
            </div>;
          })}
          {transfers.length === 0 && <p className="rg-empty">이 상황의 최소 장비세트를 모두 충족합니다.</p>}
          <div className="support-outcome"><small>지원 반영</small><strong>부족 장비군 {transfers.length}개 → {supportedKit.filter((item) => item.quantity < item.required).length}개</strong><p>표시된 수량을 지원받는다고 가정하면 준비율은 {readiness}%에서 {supportedReadiness}%로 바뀝니다.</p></div>
          <p className="score-guide"><b>지원처 선정 기준</b> 실제 보유수량과 지원 후 잔여수량을 먼저 비교하고, 조건이 비슷할 때 기존 장비 배치 패턴을 반영했습니다. 이동시간과 도로상황은 포함하지 않습니다.</p>
        </div>
      </section>

      <section className="loss-lab">
        <div className="loss-copy"><span>내부 시나리오</span><h2>손실 시뮬레이션</h2><p>담당자가 입력한 최대 예상 피해액에 장비 미확보율을 적용해 지원 전후를 비교합니다. 실제 사고 피해액 예측값은 아닙니다.</p></div>
        <label>최대 예상 피해액 <span><input type="number" min="1" max="9999" value={exposure} onChange={(event) => setExposure(Math.max(1, Number(event.target.value) || 1))} /> 억 원</span><small>설비 손상과 가동중단을 합친 내부 시나리오 값을 입력</small></label>
        <div className="loss-results">
          <div><small>현재 추정 피해액</small><strong>{money(currentExposure)}</strong><p>{money(exposure)} × 장비 미확보율 {100 - readiness}%</p></div>
          <i>→</i>
          <div><small>지원 후 추정 피해액</small><strong>{money(supportedExposure)}</strong><p>{money(exposure)} × 장비 미확보율 {100 - supportedReadiness}%</p></div>
          <div className="protected-money"><small>감소 예상액</small><strong>{money(protectedAmount)}</strong><p>장비 지원 전후의 시뮬레이션 차이</p></div>
        </div>
      </section>

      <section className="rg-model">
        <div className="rg-title"><h2>AI 학습 현황</h2><small>한국가스기술공사 공개데이터만 사용</small></div>
        <div className="model-status"><span><i />학습 데이터 반영 완료</span><p>신규 장비 공개데이터가 추가되면 같은 방식으로 다시 학습합니다.</p></div>
        <div className="rg-model-metrics"><div><small>학습 데이터</small><strong>{number.format(model.data.records)}건</strong></div><div><small>학습 사례</small><strong>{number.format(model.data.trainPairs)}쌍</strong></div><div><small>검증 사례</small><strong>{number.format(model.data.testPairs)}쌍</strong></div><div><small>검증 정확도</small><strong>{(model.metrics.accuracy * 100).toFixed(1)}%</strong></div><div><small>분류 성능(AUC)</small><strong>{model.metrics.auc.toFixed(3)}</strong></div></div>
        <p><b>사용 위치</b> 장비 지원 화면의 사업장 표시 순서를 보조합니다. 실제 보유수량과 지원 후 잔여수량을 우선 확인하고, 조건이 비슷할 때 학습한 장비 배치 패턴을 반영합니다. 정확도 64.1%이므로 최종 확인은 담당자가 수행합니다.</p>
      </section>
    </main>
  );
}
