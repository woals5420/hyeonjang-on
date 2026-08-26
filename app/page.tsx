'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import safetyData from './data/kgtc-safety.json';
import excavationModel from './data/excavation-model.json';
import eocsVolume from './data/eocs-volume.json';
import CandidateNav from './components/CandidateNav';

type TaskKey = 'pipe' | 'confined' | 'electric' | 'height' | 'hydrogen' | 'heavy';
type Profile = {
  label: string;
  base: number;
  hazard: string;
  action: string;
  stops: string[];
  equipment: string[];
  briefing: string;
  trainingKeywords: string[];
};
type ExcavationRecord = { branch: string; category: string; date: string; area: string; work: string; distance: number };
type EmergencyRecord = { site: string; equipment: string; quantity: number; location: string };
type TrainingRecord = { name: string; people: number; start: string; end: string };
type SafetyRecord = { equipment: string; sites: Record<string, number> };
type SiteZeroRecord = { site: string; start: string; cumulativeDays: number; achievement: number; achievementDate: string };
type MaintenanceRecord = { site: string; assets: Record<string, number>; total: number };
type SafetyData = {
  meta: { recordCount: number; datasetCount: number; sources: { key: string; name: string; rows: number; url: string }[] };
  excavation: { records: ExcavationRecord[]; medianDistance: number; withinThreeMeters: number; byBranch: Record<string, number>; byWork: Record<string, number>; byYear: Record<string, number>; distanceBuckets: { label: string; count: number }[] };
  emergencyEquipment: { records: EmergencyRecord[]; bySite: Record<string, { items: number; quantity: number }> };
  safetyEquipment: { records: SafetyRecord[]; siteTotals: Record<string, number> };
  training: { records: TrainingRecord[]; totalPeople: number };
  nearMiss: { records: { type: string; values: Record<string, number> }[] };
  zeroAccident: { records: SiteZeroRecord[] };
  maintenance: { records: MaintenanceRecord[] };
};
type NeuralModel = {
  name: string;
  architecture: string;
  target: string;
  allRows: number;
  trainRows: number;
  testRows: number;
  trainPeriod: string;
  testPeriod: string;
  metrics: { accuracy: number; auc: number; brier: number; testBaseRate: number };
  calibration: { priorStrength: number; globalBaseRate: number };
  features: { branches: string[]; works: string[]; monthEncoding: string; yearTrend: boolean; distance: string };
  weights: number[][][];
  biases: number[][];
  predictions: { branch: string; work: string; samples: number }[];
};

const data = safetyData as SafetyData;
const model = excavationModel as NeuralModel;
const number = new Intl.NumberFormat('ko-KR');
const eocsSource = eocsVolume.source;
const allSources = [...data.meta.sources, eocsSource];

function dense(input: number[], weights: number[][], biases: number[], relu = true) {
  return biases.map((bias, outputIndex) => {
    const value = input.reduce((sum, item, inputIndex) => sum + item * weights[inputIndex][outputIndex], bias);
    return relu ? Math.max(0, value) : 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
  });
}

function neuralProbability(branch: string, work: string, month: number, distance: number) {
  const branchVector = model.features.branches.map((item) => item === branch ? 1 : 0);
  const workVector = model.features.works.map((item) => item === work ? 1 : 0);
  const angle = 2 * Math.PI * (month - 1) / 12;
  const distanceVector = [
    Math.log1p(Math.max(0, distance)) / Math.log(131),
    distance <= 1 ? 1 : 0,
    distance <= 3 ? 1 : 0,
    distance <= 5 ? 1 : 0,
    distance <= 10 ? 1 : 0,
  ];
  const input = [...branchVector, ...workVector, Math.sin(angle), Math.cos(angle), 1, ...distanceVector];
  const hidden1 = dense(input, model.weights[0], model.biases[0]);
  const hidden2 = dense(hidden1, model.weights[1], model.biases[1]);
  return dense(hidden2, model.weights[2], model.biases[2], false)[0];
}

function adjustedNeuralProbability(branch: string, work: string, month: number, distance: number) {
  const similar = data.excavation.records.filter((record) => {
    const sameBand = distance <= 1 ? record.distance <= 1
      : distance <= 3 ? record.distance > 1 && record.distance <= 3
      : distance <= 5 ? record.distance > 3 && record.distance <= 5
      : distance <= 10 ? record.distance > 5 && record.distance <= 10
      : record.distance > 10;
    return record.branch === branch && record.work === work && sameBand;
  });
  const raw = neuralProbability(branch, work, month, distance);
  const prior = model.calibration.priorStrength;
  return (raw * similar.length + model.calibration.globalBaseRate * prior) / (similar.length + prior);
}

const tasks: Record<TaskKey, Profile> = {
  pipe: {
    label: '배관 정비', base: 42, hazard: '잔류가스·협착', action: '차단밸브 잠금과 잔압 0 확인',
    stops: ['가스 검지기 경보', '차단 상태 불명확', '작업자 간 신호 불일치'],
    equipment: ['복합가스검지기', '잠금·표찰 세트', '보안면'],
    briefing: '밸브 차단과 잔압 제거를 서로 교차 확인합니다. 손을 넣기 전 모든 구동부가 멈췄는지 다시 봅니다.',
    trainingKeywords: ['배관', '밸브', '방식', '용접'],
  },
  confined: {
    label: '밀폐공간 점검', base: 55, hazard: '산소결핍·질식', action: '입조 전 산소·가연성가스 농도 측정',
    stops: ['산소농도 18% 미만', '감시인 이탈', '환기장치 정지'],
    equipment: ['복합가스검지기', '산소농도 측정기', '공기호흡기'],
    briefing: '입조 전·중·후 농도를 기록하고 감시인은 자리를 비우지 않습니다. 구조장비 없이 진입하지 않습니다.',
    trainingKeywords: ['안전', '가스', '진단', '정비'],
  },
  electric: {
    label: '전기·계장', base: 40, hazard: '감전·오동작', action: '전원 차단 후 검전 및 잠금표찰',
    stops: ['무전압 미확인', '도면과 회로 불일치', '절연 보호구 손상'],
    equipment: ['검전기', '절연저항계', '휴대용접지장치'],
    briefing: '차단한 사람이 직접 잠금표찰을 설치합니다. 무전압 확인 전에는 충전부로 간주합니다.',
    trainingKeywords: ['전기', '계측', '제어', '교정'],
  },
  height: {
    label: '높은 곳 작업', base: 52, hazard: '추락·낙하물', action: '사다리·비계·고소작업차의 안전대 체결점과 하부 통제구역 확인',
    stops: ['안전대 체결 불가', '강풍·강우 지속', '하부 통제선 훼손'],
    equipment: ['고소작업차', '안전대', '낙하물 방지망'],
    briefing: '이동 중에도 한 줄은 항상 체결합니다. 공구는 낙하방지줄로 고정하고 하부 출입을 통제합니다.',
    trainingKeywords: ['기계', '정비', '진단'],
  },
  hydrogen: {
    label: '수소 설비', base: 58, hazard: '누출·점화원', action: '방폭형 검지기로 누출 여부 확인',
    stops: ['수소 검지기 경보', '방폭구역 점화원 발견', '환기설비 정지'],
    equipment: ['가스검지기', '가스분석기', '방폭 무전기'],
    briefing: '작은 누출도 즉시 보고합니다. 방폭구역의 점화원을 제거하고 바람 방향을 확인한 뒤 접근합니다.',
    trainingKeywords: ['가스', '압축기', '계측', '진단'],
  },
  heavy: {
    label: '중량물 작업', base: 48, hazard: '충돌·협착', action: '인양 반경 통제와 신호수 단일 지정',
    stops: ['정격하중 불명확', '신호수 복수 지시', '인양물 아래 작업자 진입'],
    equipment: ['카고크레인', '체인블럭', '유압잭'],
    briefing: '한 명의 신호수 지시만 따릅니다. 인양물 아래와 회전 반경에는 누구도 들어가지 않습니다.',
    trainingKeywords: ['기계', '펌프', '압축기', '정비'],
  },
};

const siteOptions = ['평택기지', '인천기지', '통영기지', '삼척기지', '제주LNG', '서울', '경기', '강원', '대전충청', '전북', '광주전남', '대구경북', '부산경남'];
const siteMap: Record<string, { safety: string; emergency: string; excavation: string }> = {
  평택기지: { safety: '평택기지', emergency: '평택기지지사', excavation: '경기지사' },
  인천기지: { safety: '인천기지', emergency: '인천기지지사', excavation: '인천광역지사' },
  통영기지: { safety: '통영기지', emergency: '통영기지지사', excavation: '부산경남지사' },
  삼척기지: { safety: '삼척기지', emergency: '삼척기지지사', excavation: '강원지사' },
  제주LNG: { safety: '제주LNG', emergency: '제주LNG지사', excavation: '제주지사' },
  서울: { safety: '서울', emergency: '서울지사', excavation: '서울지사' },
  경기: { safety: '경기', emergency: '경기지사', excavation: '경기지사' },
  강원: { safety: '강원', emergency: '강원지사', excavation: '강원지사' },
  대전충청: { safety: '대전충청', emergency: '대전충청지사', excavation: '대전충청지사' },
  전북: { safety: '전북', emergency: '전북지사', excavation: '전북지사' },
  광주전남: { safety: '광주전남', emergency: '광주전남지사', excavation: '광주전남지사' },
  대구경북: { safety: '대구경북', emergency: '대구경북지사', excavation: '대구경북지사' },
  부산경남: { safety: '부산경남', emergency: '부산경남지사', excavation: '부산경남지사' },
};
const conditionScores: Record<string, number> = { '신규 작업자 포함': 7, '야간 작업': 6, '우천·강풍': 8, '동시 작업': 5 };
const taskWorkMap: Record<TaskKey, string> = {
  pipe: '타공사_상수', confined: '타공사_하수', electric: '타공사_전력',
  height: '타공사_건축', hydrogen: '타공사_가스', heavy: '타공사_도로',
};
const siteAccents: Record<string, string> = {
  평택기지: '#35b99a', 인천기지: '#4aa5ff', 통영기지: '#ffb547', 삼척기지: '#8b9cff', 제주LNG: '#55c8c4',
  서울: '#ff7d64', 경기: '#5dbc8a', 강원: '#76a8ff', 대전충청: '#ffd541', 전북: '#c18cff', 광주전남: '#ef816f', 대구경북: '#9eaf55', 부산경남: '#41b5bf',
};

function shortDate(value: string) {
  const [, month, day] = value.split('-');
  return month && day ? `${Number(month)}월 ${Number(day)}일` : value;
}

function emergencyTypeCount(site: string) {
  return new Set(data.emergencyEquipment.records
    .filter((record) => record.site === site && record.quantity > 0)
    .map((record) => record.equipment)).size;
}

export default function Home() {
  const [task, setTask] = useState<TaskKey>('pipe');
  const [site, setSite] = useState('대전충청');
  const [conditions, setConditions] = useState<string[]>(['신규 작업자 포함']);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [excavationBranch, setExcavationBranch] = useState('대전충청지사');
  const [excavationWork, setExcavationWork] = useState('타공사_상수');
  const [excavationDistance, setExcavationDistance] = useState(2);
  const [excavationMonth, setExcavationMonth] = useState(8);
  const [dispatchSite, setDispatchSite] = useState('대전충청지사');
  const [equipmentQuery, setEquipmentQuery] = useState('');
  const [managerChecks, setManagerChecks] = useState([false, false, true, false]);

  const branchMax = Math.max(...Object.values(data.excavation.byBranch));
  const branchSignal = data.excavation.byBranch[siteMap[site].excavation] || 0;
  const taskNeural = adjustedNeuralProbability(siteMap[site].excavation, taskWorkMap[task], excavationMonth, 3);
  const siteRecords = data.excavation.records.filter((record) => record.branch === siteMap[site].excavation);
  const siteCloseCount = siteRecords.filter((record) => record.distance <= 3).length;
  const siteCloseRate = siteRecords.length ? Math.round((siteCloseCount / siteRecords.length) * 100) : 0;
  const siteWorkCounts = siteRecords.reduce<Record<string, number>>((counts, record) => ({ ...counts, [record.work]: (counts[record.work] || 0) + 1 }), {});
  const siteTopWork = Object.entries(siteWorkCounts).sort((a, b) => b[1] - a[1])[0] || ['기록 없음', 0];
  const siteEmergency = data.emergencyEquipment.bySite[siteMap[site].emergency] || { items: 0, quantity: 0 };
  const siteSafetyTotal = data.safetyEquipment.siteTotals[siteMap[site].safety] || 0;
  const equipmentQuantityMax = Math.max(...Object.values(data.emergencyEquipment.bySite).map((item) => item.quantity));
  const safetyTotalMax = Math.max(...Object.values(data.safetyEquipment.siteTotals));
  const excavationRecords = useMemo(() => data.excavation.records
    .filter((record) => record.branch === excavationBranch)
    .sort((a, b) => b.date.localeCompare(a.date)), [excavationBranch]);
  const closeExcavations = excavationRecords.filter((record) => record.distance <= 3).length;
  const excavationProbability = adjustedNeuralProbability(excavationBranch, excavationWork, excavationMonth, excavationDistance);
  const excavationRisk = Math.round(excavationProbability * 100);
  const excavationSamples = model.predictions.find((item) => item.branch === excavationBranch && item.work === excavationWork)?.samples || 0;

  const equipmentRows = useMemo(() => {
    const grouped = new Map<string, { quantity: number; locations: Set<string> }>();
    data.emergencyEquipment.records.filter((record) => record.site === dispatchSite).forEach((record) => {
      const current = grouped.get(record.equipment) || { quantity: 0, locations: new Set<string>() };
      current.quantity += record.quantity;
      if (record.location) current.locations.add(record.location);
      grouped.set(record.equipment, current);
    });
    return [...grouped.entries()].map(([equipment, value]) => ({ equipment, quantity: value.quantity, locations: [...value.locations].join(' · ') }))
      .filter((item) => item.quantity > 0)
      .filter((item) => item.equipment.includes(equipmentQuery.trim()))
      .sort((a, b) => b.quantity - a.quantity);
  }, [dispatchSite, equipmentQuery]);

  const safetySite = Object.values(siteMap).find((value) => value.emergency === dispatchSite)?.safety || dispatchSite.replace('지사', '');
  const safetyRows = data.safetyEquipment.records
    .map((item) => ({ equipment: item.equipment, quantity: item.sites[safetySite] || 0 }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);

  const verifiedTraining = useMemo(() => data.training.records.filter((course) => course.end >= course.start), []);
  const recommendedTraining = useMemo(() => {
    const keywords = tasks[task].trainingKeywords;
    const matched = verifiedTraining.filter((course) => keywords.some((keyword) => course.name.includes(keyword)));
    return (matched.length >= 4 ? matched : [...matched, ...verifiedTraining.filter((course) => !matched.includes(course))]).slice(0, 4);
  }, [task, verifiedTraining]);

  const yearlyNearMiss = Object.keys(data.nearMiss.records[0].values).map((year) => ({
    year,
    total: data.nearMiss.records.reduce((sum, item) => sum + item.values[year], 0),
  }));
  const nearMissMax = Math.max(...yearlyNearMiss.map((item) => item.total));
  const nearMiss2025 = [...data.nearMiss.records].sort((a, b) => b.values['2025'] - a.values['2025']);
  const maintenanceMax = Math.max(...data.maintenance.records.map((item) => item.total));
  const zeroTop = [...data.zeroAccident.records].sort((a, b) => b.cumulativeDays - a.cumulativeDays).slice(0, 5);
  const sourceTotal = allSources.reduce((sum, source) => sum + source.rows, 0);

  const toggleCondition = (condition: string) => {
    setConditions((current) => current.includes(condition) ? current.filter((item) => item !== condition) : [...current, condition]);
  };

  const changeSite = (value: string) => {
    setSite(value);
    setExcavationBranch(siteMap[value].excavation);
    setDispatchSite(siteMap[value].emergency);
  };

  const briefingText = `${site} ${tasks[task].label} 작업 전 안전브리핑\n핵심위험: ${tasks[task].hazard}\n우선조치: ${tasks[task].action}\n작업중지: ${tasks[task].stops.join(', ')}\n필수장비: ${tasks[task].equipment.join(', ')}\n${tasks[task].briefing}`;

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1800);
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#today" aria-label="현장ON 처음으로"><span className="brand-badge">ON</span><span>현장ON</span></a>
        <CandidateNav active="control" compact />
        <span className="header-status"><i /> 데이터 기준 2026.05</span>
      </header>

      <section className="workspace" id="today">
        <div className="intro compact-intro">
          <div><p className="kicker"><span /> 안전운영</p><h1>종합현황</h1></div>
          <div><p>{site} 현장의 작업 준비와 확인 대상을 모았습니다.</p><div className="data-stamp">업데이트 2026.05 <strong>{allSources.length}개 자료 · {number.format(sourceTotal)}건</strong></div></div>
        </div>

        <div className="usage-flow" aria-label="사용 순서">
          <strong>사용 순서</strong>
          <div><span>1</span><p><b>작업 선택</b><small>오늘 수행할 작업을 고릅니다.</small></p></div>
          <div><span>2</span><p><b>현장 선택</b><small>작업할 사업장을 고릅니다.</small></p></div>
          <div><span>3</span><p><b>점검 확인</b><small>오른쪽 결과대로 준비합니다.</small></p></div>
        </div>

        <div className="service-shortcuts" aria-label="업무 바로가기">
          <a href="/digsafe"><span>배관 보호</span><strong>굴착공사 관리</strong><p>현장별 미신고 가능성과 우선 확인 지사를 봅니다.</p><b>화면 열기 →</b></a>
          <a href="/recover"><span>긴급 출동</span><strong>긴급복구장비</strong><p>사업장별 보유 장비와 부족 장비의 지원처를 확인합니다.</p><b>화면 열기 →</b></a>
        </div>

        <div className="briefing-layout">
          <form className="setup-card" onSubmit={(event) => event.preventDefault()}>
            <div className="section-head"><span>1</span><div><strong>작업 선택</strong><small>작업에 맞는 점검 항목을 불러옵니다</small></div></div>
            <div className="task-grid">{(Object.keys(tasks) as TaskKey[]).map((key) => <button key={key} type="button" className={task === key ? 'selected' : ''} onClick={() => setTask(key)}><span className="radio" />{tasks[key].label}</button>)}</div>
            <label className="field-label" htmlFor="site"><span>2</span> 작업 현장</label>
            <select id="site" value={site} onChange={(event) => changeSite(event.target.value)}>{siteOptions.map((item) => <option key={item}>{item}</option>)}</select>
            <div className="field-label">현장 조건 <small>해당되는 경우만 선택</small></div>
            <div className="condition-list">{Object.keys(conditionScores).map((item) => <button key={item} type="button" className={conditions.includes(item) ? 'checked' : ''} onClick={() => toggleCondition(item)}><span className="checkmark">✓</span>{item}</button>)}</div>
          </form>

          <article className="result-card" aria-live="polite" style={{ '--site-accent': siteAccents[site] } as CSSProperties}>
            <div className="result-top"><div><span className="result-caption">3 · {site} · {tasks[task].label}</span><h2>점검 결과</h2></div><div className="risk-score"><small>추가 현장조건</small><strong>{conditions.length}</strong><em>건</em></div></div>
            <div className="risk-guide"><span>점수 대신 선택한 조건과 실제 데이터 근거를 그대로 표시합니다.</span></div>
            <p className="site-fingerprint-label">선택한 현장의 과거 현황</p>
            <div className="site-fingerprint" aria-label={`${site} 현장 현황`}>
              <div><span><i style={{ width: `${Math.round((branchSignal / branchMax) * 100)}%` }} /></span><small>굴착 {branchSignal}건</small></div>
              <div><span><i style={{ width: `${siteCloseRate}%` }} /></span><small>3m 이내 {siteCloseRate}%</small></div>
              <div><span><i style={{ width: `${Math.round((siteEmergency.quantity / equipmentQuantityMax) * 100)}%` }} /></span><small>복구장비 {siteEmergency.quantity}대</small></div>
              <div><span><i style={{ width: `${Math.round((siteSafetyTotal / safetyTotalMax) * 100)}%` }} /></span><small>안전장비 {siteSafetyTotal}대</small></div>
            </div>
            <div className="priority-alert"><span>지금 확인할 위험</span><strong>{tasks[task].hazard}</strong><p>{tasks[task].action}</p></div>
            <div className="briefing-row"><span>이 경우 작업중지</span><p>{tasks[task].stops.join(' · ')}</p></div>
            <div className="briefing-row"><span>작업 전 준비</span><p>{tasks[task].equipment.join(' · ')}</p></div>
            <div className="history-note"><span>과거 기록 반영</span><p>{siteMap[site].excavation} {siteTopWork[0].replace('타공사_', '')} {siteTopWork[1]}건 · 미신고 가능성 {Math.round(taskNeural * 100)}%</p></div>
            <button className="start-button" type="button" onClick={() => setBriefingOpen(true)}>작업 전 브리핑 보기 <span>→</span></button>
          </article>
        </div>

        <div className="data-ribbon" aria-label="현재 연결된 자료">
          <div><small>굴착 예방활동 기록</small><strong>{number.format(data.excavation.records.length)}</strong><span>건</span></div>
          <div><small>긴급복구장비 기록</small><strong>{number.format(data.emergencyEquipment.records.length)}</strong><span>건</span></div>
          <div><small>유지보수 교육과정</small><strong>{data.training.records.length}</strong><span>과정</span></div>
          <div><small>안전관리 장비종류</small><strong>{data.safetyEquipment.records.length}</strong><span>종</span></div>
          <div><small>아차사고 분석기간</small><strong>8</strong><span>개년</span></div>
          <div><small>장비 관리 사업장</small><strong>{Object.keys(data.emergencyEquipment.bySite).length}</strong><span>곳</span></div>
        </div>
      </section>

      <section className="excavation-section" id="excavation">
        <div className="section-heading light-heading"><div><p className="kicker"><span /> 배관 보호구역</p><h2><a className="section-title-link" href="/digsafe">굴착공사 관리 <small>→</small></a></h2></div><p>과거 예방활동과 현장 조건을 반영해 먼저 확인할 지사를 찾습니다.</p></div>
        <div className="excavation-kpis">
          <div><small>전체 예방활동</small><strong>642</strong><span>건</span></div>
          <div><small>배관 3m 이내</small><strong>{number.format(data.excavation.withinThreeMeters)}</strong><span>건</span></div>
          <div><small>중앙 이격거리</small><strong>{data.excavation.medianDistance}</strong><span>m</span></div>
          <div><small>최다 관할</small><strong>대전충청</strong><span>154건</span></div>
        </div>

        <div className="excavation-grid">
          <div className="excavation-map">
            <div className="panel-heading"><div><strong>지사별 감시 밀도</strong><small>2019–2026 예방활동 누적</small></div><select aria-label="굴착 기록 관할 지사" value={excavationBranch} onChange={(event) => setExcavationBranch(event.target.value)}>{Object.keys(data.excavation.byBranch).map((branch) => <option key={branch}>{branch}</option>)}</select></div>
            <div className="branch-bars">{Object.entries(data.excavation.byBranch).map(([branch, count]) => <button key={branch} className={branch === excavationBranch ? 'active-branch' : ''} onClick={() => setExcavationBranch(branch)}><span>{branch.replace('지사', '')}</span><div><i style={{ width: `${Math.round((count / branchMax) * 100)}%` }} /></div><strong>{count}</strong></button>)}</div>
          </div>

          <div className="risk-simulator">
            <div className="panel-heading"><div><strong>현장 확인</strong><small>관할·공종·시기·이격거리 반영</small></div><span className={excavationRisk >= 70 ? 'risk-high' : 'risk-watch'}>{excavationRisk >= 70 ? '즉시 확인' : '순찰 우선'}</span></div>
            <label>작업 월 <strong>{excavationMonth}월</strong><input aria-label="굴착 작업 월" type="range" min="1" max="12" step="1" value={excavationMonth} onChange={(event) => setExcavationMonth(Number(event.target.value))} /></label>
            <label>공사 종류<select value={excavationWork} onChange={(event) => setExcavationWork(event.target.value)}>{Object.keys(data.excavation.byWork).map((work) => <option key={work}>{work.replace('타공사_', '')}</option>)}</select></label>
            <label>배관과 이격거리 <strong>{excavationDistance}m</strong><input aria-label="배관과 이격거리" type="range" min="0" max="20" step="0.5" value={excavationDistance} onChange={(event) => setExcavationDistance(Number(event.target.value))} /></label>
            <div className="excavation-score"><small>미신고 가능성</small><strong>{excavationRisk}</strong><span>%</span></div>
            <p>유사 기록 {excavationSamples}건 반영 · {excavationDistance <= 3 ? '배관 3m 이내, 신고 여부와 입회자 즉시 확인' : '순찰 등록 후 굴착 전 신고 재확인'}</p>
          </div>
        </div>

        <div className="case-table-wrap">
          <div className="panel-heading"><div><strong>{excavationBranch} 최근 확인 기록</strong><small>총 {number.format(excavationRecords.length)}건 · 3m 이내 {closeExcavations}건</small></div><span>배관 이격거리</span></div>
          <div className="case-table"><div className="table-row table-head"><span>점검일</span><span>지역</span><span>공사 종류</span><span>이격거리</span><span>상태</span></div>{excavationRecords.slice(0, 6).map((record, index) => <div className="table-row" key={`${record.date}-${record.area}-${index}`}><time>{record.date}</time><span>{record.area}</span><strong>{record.work.replace('타공사_', '')}</strong><span>{record.distance}m</span><em className={record.distance <= 3 ? 'distance-danger' : 'distance-safe'}>{record.distance <= 3 ? '우선 확인' : '관찰'}</em></div>)}</div>
        </div>
      </section>

      <section className="dispatch-section" id="dispatch">
        <div className="section-heading"><div><p className="kicker"><span /> 14개 사업장 · 350건</p><h2><a className="section-title-link" href="/recover">긴급복구장비 <small>→</small></a></h2></div><p>사업장별 보유 장비와 부족 장비의 지원 가능 사업장을 확인합니다.</p></div>
        <div className="dispatch-grid">
          <aside className="site-selector"><span>출동 사업장</span>{Object.keys(data.emergencyEquipment.bySite).map((item) => <button key={item} className={dispatchSite === item ? 'selected-site' : ''} onClick={() => setDispatchSite(item)}><strong>{item.replace('지사', '')}</strong><small>{emergencyTypeCount(item)}종 · {data.emergencyEquipment.bySite[item].quantity}대</small></button>)}</aside>
          <div className="inventory-panel">
            <div className="inventory-summary"><div><small>선택 사업장</small><strong>{dispatchSite}</strong></div><div><small>실보유 장비 종류</small><strong>{emergencyTypeCount(dispatchSite)}</strong></div><div><small>보유 수량</small><strong>{data.emergencyEquipment.bySite[dispatchSite]?.quantity || 0}</strong></div><div><small>안전관리 장비</small><strong>{data.safetyEquipment.siteTotals[safetySite] || 0}</strong></div></div>
            <label className="inventory-search"><span>장비 찾기</span><input aria-label="긴급복구 장비명 검색" value={equipmentQuery} onChange={(event) => setEquipmentQuery(event.target.value)} placeholder="예: 가스검지기, 크레인, 펌프" /></label>
            <div className="inventory-table"><div className="inventory-row inventory-head"><span>장비명</span><span>수량</span><span>보유장소</span></div>{equipmentRows.slice(0, 10).map((item) => <div className="inventory-row" key={item.equipment}><strong>{item.equipment}</strong><span>{item.quantity}대</span><span>{item.locations || '사업장 내 지정장소'}</span></div>)}{equipmentRows.length === 0 && <p className="empty-state">검색한 장비가 이 사업장에 없습니다.</p>}</div>
            <div className="dispatch-action"><div><span>안전관리 장비 상위 보유</span><p>{safetyRows.slice(0, 4).map((item) => `${item.equipment} ${item.quantity}대`).join(' · ') || '연결된 장비현황 없음'}</p></div><button type="button" onClick={() => copyText(`${dispatchSite} 출동 장비\n${equipmentRows.slice(0, 8).map((item) => `${item.equipment} ${item.quantity}대 (${item.locations})`).join('\n')}`, 'dispatch')}>{copied === 'dispatch' ? '복사 완료' : '출동목록 복사'}</button></div>
          </div>
        </div>
      </section>

      <section className="capacity-section" id="capacity">
        <div className="section-heading light-heading"><div><p className="kicker"><span /> 5개 기지 · 53개 과정</p><h2>정비·교육</h2></div><p>정비 물량과 작업별 교육 이력을 함께 봅니다.</p></div>
        <div className="capacity-grid">
          <div className="maintenance-panel">
            <div className="panel-heading"><div><strong>주요 생산설비 정비 규모</strong><small>기지별 5개 설비군 합계</small></div><span>총 {data.maintenance.records.reduce((sum, item) => sum + item.total, 0)}기·선좌</span></div>
            {data.maintenance.records.map((item) => <div className="maintenance-row" key={item.site}><strong>{item.site}</strong><div><i style={{ width: `${Math.round((item.total / maintenanceMax) * 100)}%` }} /></div><span>{item.total}</span></div>)}
            <div className="asset-legend">{Object.keys(data.maintenance.records[0].assets).map((asset) => <span key={asset}>{asset.replace('(기)', '').replace('(선좌)', '')}</span>)}</div>
          </div>
          <div className="training-panel">
            <div className="panel-heading"><div><strong>{tasks[task].label} 추천 교육</strong><small>원문 53개 · 일정 확인 {verifiedTraining.length}개</small></div><span>작업 연계</span></div>
            <div className="course-list">{recommendedTraining.map((course, index) => <article key={course.name}><em>0{index + 1}</em><div><strong>{course.name}</strong><p>{shortDate(course.start)}–{shortDate(course.end)} · {course.people}명</p></div><span>{tasks[task].trainingKeywords.find((keyword) => course.name.includes(keyword)) || '실무'}</span></article>)}</div>
          </div>
        </div>
      </section>

      <section className="control-section" id="control">
        <div className="section-heading"><div><p className="kicker"><span /> 2018–2025</p><h2>안전 지표</h2></div><div className="control-total"><small>안전현황 원자료</small><strong>{data.meta.datasetCount}종</strong><span>{number.format(data.meta.recordCount)}건</span></div></div>
        <div className="control-grid">
          <div className="trend-panel">
            <div className="panel-heading"><div><strong>아차사고 발굴 추이</strong><small>8개 유형 연간 합계</small></div><span>2018–2025</span></div>
            <div className="year-chart">{yearlyNearMiss.map((item) => <div key={item.year}><span>{item.total}</span><i style={{ height: `${Math.round((item.total / nearMissMax) * 100)}%` }} /><small>{item.year.slice(2)}</small></div>)}</div>
            <div className="top-risks">{nearMiss2025.slice(0, 4).map((item, index) => <div key={item.type}><span>0{index + 1}</span><strong>{item.type}</strong><em>{item.values['2025']}건</em></div>)}</div>
          </div>
          <div className="zero-panel">
            <div className="panel-heading"><div><strong>무재해 누적 상위 사업장</strong><small>사업장별 누적 달성일수</small></div><span>14개 사업장</span></div>
            {zeroTop.map((item, index) => <div className="zero-row" key={item.site}><span>{index + 1}</span><strong>{item.site}</strong><div><i style={{ width: `${Math.round((item.cumulativeDays / zeroTop[0].cumulativeDays) * 100)}%` }} /></div><em>{number.format(item.cumulativeDays)}일</em></div>)}
          </div>
        </div>

        <div className="manager-block">
          <div className="manager-heading"><div><span>현장 조치 메모</span><h3>확인해야 할 일 {managerChecks.filter((item) => !item).length}건</h3></div><small>선택한 현장·작업 기준 · 항목을 누르면 완료</small></div>
          <div className="action-list">{[
            [siteMap[site].excavation, '굴착 확인', `${branchSignal}건 중 배관 3m 이내 기록과 EOCS 신고 여부 확인`, '확인 필요'],
            [dispatchSite, '장비 출동', `${equipmentRows[0]?.equipment || '복구장비'} 포함 출동목록 담당자 교차 확인`, '확인 필요'],
            [site, tasks[task].label, `${tasks[task].equipment[0]} 작업 전 상태점검`, '확인 필요'],
            ['전사', '교육 확인', `${recommendedTraining[0]?.name || '유지보수 과정'} 이수 대상 확인`, '확인 필요'],
          ].map((item, index) => <button key={`${item[0]}-${index}`} className={managerChecks[index] ? 'action checked-action' : 'action'} onClick={() => setManagerChecks((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))}><span className="action-check">✓</span><strong>{item[0]}</strong><span>{item[1]}</span><p>{item[2]}</p><time>{managerChecks[index] ? '완료' : item[3]}</time></button>)}</div>
        </div>
      </section>

      <section className="data-catalog">
        <div><p className="kicker"><span /> {allSources.length}종 · {number.format(sourceTotal)}건</p><h2>데이터 원문</h2></div>
        <div className="source-list">{allSources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.key}><span>0{index + 1}</span><strong>{source.name}</strong><em>{number.format(source.rows)}건</em><i>↗</i></a>)}</div>
      </section>

      <footer><a className="brand" href="#today"><span className="brand-badge">ON</span><span>현장ON</span></a><CandidateNav active="control" compact /><span>한국가스기술공사 공개데이터 {allSources.length}종</span></footer>

      {briefingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setBriefingOpen(false)}><section className="briefing-modal" role="dialog" aria-modal="true" aria-labelledby="briefing-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setBriefingOpen(false)} aria-label="닫기">×</button><span className="modal-site">{site} · {tasks[task].label}</span><h2 id="briefing-title">60초 안전브리핑</h2><div className="timer-line"><span /> 약 60초</div><div className="script-step"><em>01</em><div><small>위험을 말합니다</small><strong>오늘 가장 주의할 것은 {tasks[task].hazard}입니다.</strong></div></div><div className="script-step"><em>02</em><div><small>조치를 확인합니다</small><strong>{tasks[task].action}.</strong></div></div><div className="script-step"><em>03</em><div><small>중지 기준을 합의합니다</small><strong>{tasks[task].stops[0]} 시 누구든 “작업중지”를 외칩니다.</strong></div></div><div className="script-step"><em>04</em><div><small>과거 신호를 공유합니다</small><strong>{siteMap[site].excavation} 미신고 굴착 예방활동은 {number.format(branchSignal)}건입니다.</strong></div></div><p className="script-close">{tasks[task].briefing}</p><div className="modal-actions"><button type="button" onClick={() => copyText(briefingText, 'briefing')}>{copied === 'briefing' ? '복사했습니다' : '내용 복사'}</button><button type="button" onClick={() => window.print()}>인쇄하기</button></div></section></div>}
    </main>
  );
}
