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
  leak: { label: '가스 누출', description: '검지·호흡보호·환기·조명', requirements: [sharedRequirements.detector, sharedRequirements.respirator, sharedRequirements.ventilation, sharedRequirements.lighting] },
  flood: { label: '침수', description: '배수·비상전원·전원연결·조명', requirements: [sharedRequirements.pump, sharedRequirements.generator, sharedRequirements.cable, sharedRequirements.lighting] },
  lift: { label: '중량물 사고', description: '인양·고정·틈새 확보', requirements: [sharedRequirements.crane, sharedRequirements.hoist, sharedRequirements.jack] },
  outage: { label: '정전', description: '비상전원·복전 확인·조명', requirements: [sharedRequirements.generator, sharedRequirements.cable, sharedRequirements.insulation, sharedRequirements.meter, sharedRequirements.lighting] },
  confined: { label: '밀폐공간 사고', description: '검지·호흡보호·환기·배수', requirements: [sharedRequirements.detector, sharedRequirements.oxygen, sharedRequirements.respirator, sharedRequirements.ventilation, sharedRequirements.pump] },
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
  const requirements = incidents[incident].requirements as readonly Requirement[];

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
    const candidates = model.sites.filter((candidate) => candidate !== site).map((candidate) => {
      const stock = inventoryFor(candidate, needed);
      const learnedNames = model.equipment.filter((name) => matches(name, needed));
      const neural = learnedNames.length ? learnedNames.reduce((sum, name) => sum + compatibility(candidate, name), 0) / learnedNames.length : 0;
      return { site: candidate, ...stock, neural };
    }).filter((candidate) => candidate.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity || b.neural - a.neural);
    return { ...needed, shortage: Math.max(0, needed.required - needed.quantity), candidates };
  }).filter((item) => item.shortage > 0);

  const supportedKit = kit.map((item) => {
    const support = transfers.find((transfer) => transfer.key === item.key)?.candidates[0];
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

      <div className="page-howto recover-howto"><strong>{incidents[incident].label}</strong><span>{incidents[incident].description}</span><i>→</i><span>보유 수량·부족 수량·지원 사업장을 바로 확인</span></div>

      <section className="rg-status">
        <div className="readiness-ring" style={{ background: `conic-gradient(var(--grid-accent) ${readiness}%, #e2e7e3 ${readiness}% 100%)` }}><div><strong>{readiness}</strong><span>%</span><small>장비 준비율</small></div></div>
        <div className="rg-site-summary"><span>{site}</span><h2>{incidents[incident].label}</h2><div><p><small>전체 보유 품목</small><strong>{data.emergencyEquipment.bySite[site]?.items || 0}</strong></p><p><small>전체 보유 수량</small><strong>{data.emergencyEquipment.bySite[site]?.quantity || 0}</strong></p><p><small>부족 장비군</small><strong>{transfers.length}</strong></p></div><p className="readiness-summary">준비율은 단순 보유 품목 비율이 아닙니다. 사고별 최소 수량과 중요도까지 반영한 값입니다.</p></div>
        <div className="rg-fingerprint"><span>보유 구성</span>{fingerprintGroups.map((item) => <div key={item.label}><small>{item.label}</small><i><b style={{ width: `${Math.round(item.quantity / fingerprintMax * 100)}%` }} /></i><strong>{item.quantity}</strong></div>)}</div>
      </section>

      <section className="readiness-proof">
        <div className="rg-title"><h2>준비율 계산</h2><small>실제 보유수량 우선</small></div>
        <p><b>Σ(중요도 × 보유수량 충족률) ÷ 중요도 합 × 100</b> · 충족률은 보유수량 ÷ 시뮬레이션 최소수량이며 100%를 넘겨 계산하지 않습니다.</p>
        <div className="proof-chips"><span>핵심 3</span><span>보조 2</span><span>지원 1</span><em>최소수량은 사고 비교를 위한 서비스 기준이며 한국가스기술공사의 공식 출동 기준은 아닙니다.</em></div>
      </section>

      <section className="rg-main-grid">
        <div className="dispatch-kit">
          <div className="rg-title"><h2>필요 장비</h2><small>{site.replace('지사', '')} · {incidents[incident].label}</small></div>
          <p className="section-help">같은 장비가 띄어쓰기나 영문명으로 적힌 경우까지 하나의 장비군으로 합쳤습니다.</p>
          <div className="kit-columns kit-columns-wide"><span>장비</span><span>용도</span><span>보유 / 최소</span><span>충족</span></div>
          {kit.map((item) => {
            const coverage = Math.min(item.quantity / item.required, 1);
            return <div className="kit-row kit-row-wide" key={item.key}><strong>{item.label}<small>{item.names.slice(0, 2).join(' · ') || '해당 장비 없음'}</small></strong><span>{item.purpose}</span><b>{item.quantity} / {item.required}</b><em className={coverage >= 1 ? 'kit-ready' : 'kit-missing'}>{coverage >= 1 ? '충족' : `${item.required - item.quantity}대 부족`}</em></div>;
          })}
        </div>

        <div className="transfer-board">
          <div className="rg-title"><h2>AI 지원안</h2><small>실보유 수량 + 장비 구성 신경망</small></div>
          <p className="section-help">부족 장비를 실제로 가진 사업장을 먼저 찾고, 동률이면 350건의 배치 패턴을 학습한 신경망이 순서를 정합니다.</p>
          {transfers.map((item) => <div className="transfer-row" key={item.key}><div><strong>{item.label}</strong><small>{item.shortage}대 부족</small></div>{item.candidates[0] ? <><span><small>지원 1순위</small>{item.candidates[0].site.replace('지사', '')}</span><b>{item.candidates[0].quantity}대 보유</b><em>연결</em></> : <p>다른 사업장에도 확인 가능한 장비가 없습니다.</p>}</div>)}
          {transfers.length === 0 && <p className="rg-empty">이 상황의 최소 장비세트를 모두 충족합니다.</p>}
          <div className="support-outcome"><small>지원 확보 시</small><strong>{readiness}% → {supportedReadiness}%</strong><p>상단 추천 사업장에서 부족 수량을 확보한다고 가정한 준비율입니다.</p></div>
        </div>
      </section>

      <section className="loss-lab">
        <div className="loss-copy"><span>손실 방어</span><h2>장비를 옮기면 얼마나 지킬 수 있나</h2><p>피해액 정답 데이터가 없으므로 가짜 피해액을 예측하지 않습니다. 담당자가 입력한 최대 노출액 중 장비 공백에 해당하는 금액만 계산합니다.</p></div>
        <label>사고 시 최대 노출액 <span><input type="number" min="1" max="9999" value={exposure} onChange={(event) => setExposure(Math.max(1, Number(event.target.value) || 1))} /> 억 원</span><small>설비 손상·가동중단을 합친 내부 시나리오 값을 입력</small></label>
        <div className="loss-results">
          <div><small>현재 공백 노출</small><strong>{money(currentExposure)}</strong><p>{money(exposure)} × 대응공백 {100 - readiness}%</p></div>
          <i>→</i>
          <div><small>지원 후 공백 노출</small><strong>{money(supportedExposure)}</strong><p>{money(exposure)} × 대응공백 {100 - supportedReadiness}%</p></div>
          <div className="protected-money"><small>방어 가능액</small><strong>{money(protectedAmount)}</strong><p>지원 전후 차이</p></div>
        </div>
      </section>

      <section className="rg-model">
        <div className="rg-title"><h2>신경망 범위</h2><small>한국가스기술공사 데이터만 사용</small></div>
        <div className="rg-model-metrics"><div><small>장비 기록</small><strong>{number.format(model.data.records)}</strong></div><div><small>사업장</small><strong>{model.data.sites}</strong></div><div><small>반복 장비명</small><strong>{model.data.equipmentTypes}</strong></div><div><small>학습 구조</small><strong>16→12→6</strong></div><div><small>검증 AUC</small><strong>{model.metrics.auc.toFixed(3)}</strong></div></div>
        <p>신경망은 피해액을 만들지 않고 지원 사업장의 순서만 정합니다. 준비율은 실제 보유수량으로 계산하며, 금액은 사용자가 입력한 노출액을 사용합니다.</p>
      </section>
    </main>
  );
}
