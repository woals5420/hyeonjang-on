'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import safetyData from './data/kgtc-safety.json';
import eocsVolume from './data/eocs-volume.json';
import CandidateNav from './components/CandidateNav';

type TaskKey = 'pipe' | 'confined' | 'electric' | 'height' | 'hydrogen' | 'heavy';
type Profile = {
  label: string;
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
type SafetyData = {
  meta: { recordCount: number; datasetCount: number; sources: { key: string; name: string; rows: number; url: string }[] };
  excavation: { records: ExcavationRecord[]; byBranch: Record<string, number> };
  emergencyEquipment: { records: EmergencyRecord[]; bySite: Record<string, { items: number; quantity: number }> };
  safetyEquipment: { records: SafetyRecord[]; siteTotals: Record<string, number> };
  training: { records: TrainingRecord[] };
  nearMiss: { records: { type: string; values: Record<string, number> }[] };
  zeroAccident: { records: { site: string; cumulativeDays: number }[] };
  maintenance: { records: { site: string; total: number }[] };
};

const data = safetyData as SafetyData;
const number = new Intl.NumberFormat('ko-KR');
const allSources = [...data.meta.sources, eocsVolume.source];
const sourceDates: Record<string, string> = {
  excavation: '2026.04',
  emergency: '2026.05',
  training: '2025.11',
  safety: '2026.05',
  nearMiss: '2025.12',
  zeroAccident: '2025.04',
  maintenance: '2026.04',
  eocs: '2024.06',
};

const tasks: Record<TaskKey, Profile> = {
  pipe: {
    label: '배관 정비', hazard: '잔류가스·협착', action: '차단밸브 잠금과 잔압 0을 서로 확인',
    stops: ['가스 검지기 경보', '차단 상태 불명확', '작업자 간 신호 불일치'],
    equipment: ['복합가스검지기', '잠금·표찰 세트', '보안면'],
    briefing: '밸브 차단과 잔압 제거를 교차 확인하고, 모든 구동부가 멈춘 뒤 작업합니다.',
    trainingKeywords: ['배관', '밸브', '방식', '용접'],
  },
  confined: {
    label: '밀폐공간 점검', hazard: '산소결핍·질식', action: '입조 전 산소·가연성가스 농도 측정',
    stops: ['산소농도 18% 미만', '감시인 이탈', '환기장치 정지'],
    equipment: ['복합가스검지기', '산소농도 측정기', '공기호흡기'],
    briefing: '입조 전·중·후 농도를 기록하고 구조장비와 감시인이 없으면 진입하지 않습니다.',
    trainingKeywords: ['밀폐', '안전', '가스'],
  },
  electric: {
    label: '전기·계장', hazard: '감전·오동작', action: '전원 차단 후 검전 및 잠금표찰',
    stops: ['무전압 미확인', '도면과 회로 불일치', '절연 보호구 손상'],
    equipment: ['검전기', '절연저항계', '휴대용접지장치'],
    briefing: '무전압을 확인하기 전에는 충전부로 간주하고, 차단한 사람이 직접 잠금표찰을 설치합니다.',
    trainingKeywords: ['전기', '계측', '제어', '교정'],
  },
  height: {
    label: '높은 곳 작업', hazard: '추락·낙하물', action: '안전대 체결점과 하부 통제구역 확인',
    stops: ['안전대 체결 불가', '강풍·강우 지속', '하부 통제선 훼손'],
    equipment: ['고소작업차', '안전대', '낙하물 방지망'],
    briefing: '이동 중에도 한 줄은 항상 체결하고 공구는 낙하방지줄로 고정합니다.',
    trainingKeywords: ['고소', '추락', '안전대'],
  },
  hydrogen: {
    label: '수소 설비', hazard: '누출·점화원', action: '방폭형 검지기로 누출 여부 확인',
    stops: ['수소 검지기 경보', '방폭구역 점화원 발견', '환기설비 정지'],
    equipment: ['가스검지기', '가스분석기', '방폭 무전기'],
    briefing: '작은 누출도 즉시 보고하고, 점화원을 제거한 뒤 바람 방향을 확인해 접근합니다.',
    trainingKeywords: ['수소', '가스', '방폭'],
  },
  heavy: {
    label: '중량물 작업', hazard: '충돌·협착', action: '인양 반경 통제와 신호수 단일 지정',
    stops: ['정격하중 불명확', '신호수 복수 지시', '인양물 아래 작업자 진입'],
    equipment: ['카고크레인', '체인블럭', '유압잭'],
    briefing: '한 명의 신호수 지시만 따르고 인양물 아래와 회전 반경에는 들어가지 않습니다.',
    trainingKeywords: ['인양', '중량', '크레인'],
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
const siteAccents: Record<string, string> = {
  평택기지: '#35b99a', 인천기지: '#4aa5ff', 통영기지: '#ffb547', 삼척기지: '#8b9cff', 제주LNG: '#55c8c4',
  서울: '#ff7d64', 경기: '#5dbc8a', 강원: '#76a8ff', 대전충청: '#ffd541', 전북: '#c18cff', 광주전남: '#ef816f', 대구경북: '#9eaf55', 부산경남: '#41b5bf',
};

function shortDate(value: string) {
  const [, month, day] = value.split('-');
  return month && day ? Number(month) + '월 ' + Number(day) + '일' : value;
}

function emergencyTypeCount(site: string) {
  return new Set(data.emergencyEquipment.records.filter((record) => record.site === site && record.quantity > 0).map((record) => record.equipment)).size;
}

export default function Home() {
  const [task, setTask] = useState<TaskKey>('pipe');
  const [site, setSite] = useState('대전충청');
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const mapping = siteMap[site];
  const branchRecords = data.excavation.records.filter((record) => record.branch === mapping.excavation);
  const closeRecords = branchRecords.filter((record) => record.distance <= 3);
  const closeRate = branchRecords.length ? Math.round(closeRecords.length / branchRecords.length * 100) : 0;
  const emergencySummary = data.emergencyEquipment.bySite[mapping.emergency] || { items: 0, quantity: 0 };
  const safetyTotal = data.safetyEquipment.siteTotals[mapping.safety] || 0;
  const inventoryRows = data.emergencyEquipment.records.filter((record) => record.site === mapping.emergency && record.quantity > 0).sort((a, b) => b.quantity - a.quantity);
  const validTraining = useMemo(() => data.training.records.filter((course) => course.end >= course.start), []);
  const matchingTraining = useMemo(() => validTraining.filter((course) => tasks[task].trainingKeywords.some((keyword) => course.name.includes(keyword))).slice(0, 4), [task, validTraining]);
  const topNearMiss = [...data.nearMiss.records].sort((a, b) => b.values['2025'] - a.values['2025'])[0];
  const topZero = [...data.zeroAccident.records].sort((a, b) => b.cumulativeDays - a.cumulativeDays)[0];
  const maintenanceTotal = data.maintenance.records.reduce((sum, item) => sum + item.total, 0);
  const sourceTotal = allSources.reduce((sum, source) => sum + source.rows, 0);

  const briefingText = site + ' ' + tasks[task].label + ' 작업 전 안전브리핑\n'
    + '핵심위험: ' + tasks[task].hazard + '\n우선조치: ' + tasks[task].action
    + '\n작업중지: ' + tasks[task].stops.join(', ') + '\n준비장비: ' + tasks[task].equipment.join(', ') + '\n' + tasks[task].briefing;

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
        <span className="header-status"><i /> 마지막 수집 2026.05</span>
      </header>

      <section className="workspace" id="today">
        <div className="intro compact-intro">
          <div><p className="kicker"><span /> 안전운영</p><h1>종합현황</h1></div>
          <div><p>미신고 굴착 확인과 긴급복구장비 지원을 한 화면에서 연결합니다.</p><div className="data-stamp">자료별 기준일 상이 <strong>{allSources.length}개 자료 · {number.format(sourceTotal)}건</strong></div></div>
        </div>

        <div className="briefing-layout hq-layout">
          <form className="setup-card" onSubmit={(event) => event.preventDefault()}>
            <div className="section-head"><span>1</span><div><strong>작업</strong><small>오늘 수행할 업무를 고릅니다</small></div></div>
            <div className="task-grid">{(Object.keys(tasks) as TaskKey[]).map((key) => <button key={key} type="button" aria-pressed={task === key} className={task === key ? 'selected' : ''} onClick={() => setTask(key)}><span className="radio" />{tasks[key].label}</button>)}</div>
            <label className="field-label" htmlFor="site"><span>2</span> 사업장</label>
            <select id="site" value={site} onChange={(event) => setSite(event.target.value)}>{siteOptions.map((item) => <option key={item}>{item}</option>)}</select>
            <p className="setup-note">기지와 지사를 동일 권역으로 묶은 화면용 연결입니다. 실제 관할은 담당자가 확인합니다.</p>
          </form>

          <article className="result-card" aria-live="polite" style={{ '--site-accent': siteAccents[site] } as CSSProperties}>
            <div className="result-top"><div><span className="result-caption">{site} · {tasks[task].label}</span><h2>작업 전 확인</h2></div><span className="scope-pill">작업 참고안</span></div>
            <p className="result-disclaimer">아래 위험·중지 기준은 작업 준비를 돕는 참고안입니다. 사업장 절차와 현장 책임자 확인을 우선합니다.</p>
            <p className="site-fingerprint-label">선택 사업장 공개데이터</p>
            <div className="site-fingerprint" aria-label={site + ' 공개데이터 현황'}>
              <div><strong>{branchRecords.length}</strong><small>굴착 확인 기록</small></div>
              <div><strong>{closeRate}%</strong><small>배관 3m 이내</small></div>
              <div><strong>{emergencySummary.quantity}</strong><small>복구장비 수량</small></div>
              <div><strong>{safetyTotal}</strong><small>안전장비 수량</small></div>
            </div>
            <div className="priority-alert"><span>핵심 위험</span><strong>{tasks[task].hazard}</strong><p>{tasks[task].action}</p></div>
            <div className="briefing-row"><span>작업중지</span><p>{tasks[task].stops.join(' · ')}</p></div>
            <div className="briefing-row"><span>준비장비</span><p>{tasks[task].equipment.join(' · ')}</p></div>
            <button className="start-button" type="button" onClick={() => setBriefingOpen(true)}>안전브리핑 열기 <span>→</span></button>
          </article>
        </div>

        <div className="operations-summary" aria-label="핵심 업무">
          <article className="decision-card">
            <span>배관 보호 · {mapping.excavation}</span><h2>굴착공사 확인</h2>
            <div><strong>{branchRecords.length}건</strong><small>과거 확인 기록</small><strong>{closeRecords.length}건</strong><small>배관 3m 이내</small></div>
            <p>공종·예정월·배관거리로 과거 미신고 유형과 유사한 현장을 찾습니다.</p><a href="/digsafe">굴착공사 분석 열기 →</a>
          </article>
          <article className="decision-card emergency-card">
            <span>긴급 출동 · {mapping.emergency}</span><h2>장비 지원 검토</h2>
            <div><strong>{emergencyTypeCount(mapping.emergency)}종</strong><small>실보유 종류</small><strong>{emergencySummary.quantity}대</strong><small>전체 수량</small></div>
            <p>{inventoryRows.slice(0, 3).map((item) => item.equipment + ' ' + item.quantity + '대').join(' · ') || '보유 장비 없음'}</p><a href="/recover">지원 후보 확인 →</a>
          </article>
        </div>
      </section>

      <section className="capacity-section compact-capacity">
        <div className="section-heading light-heading"><div><p className="kicker"><span /> 선택 작업</p><h2>교육과 전사 참고</h2></div><p>선택 작업과 이름이 직접 연결되는 과정만 표시합니다.</p></div>
        <div className="capacity-grid">
          <div className="training-panel">
            <div className="panel-heading"><div><strong>{tasks[task].label} 연계 교육</strong><small>일정이 확인된 과정 {validTraining.length}개 중 직접 일치</small></div><span>{matchingTraining.length}개</span></div>
            <div className="course-list">
              {matchingTraining.map((course, index) => <article key={course.name}><em>0{index + 1}</em><div><strong>{course.name}</strong><p>{shortDate(course.start)}–{shortDate(course.end)} · {course.people}명</p></div><span>{tasks[task].trainingKeywords.find((keyword) => course.name.includes(keyword))}</span></article>)}
              {matchingTraining.length === 0 && <p className="empty-state">공개 과정명에서 직접 연결되는 교육을 찾지 못했습니다. 임의 과정은 추천하지 않습니다.</p>}
            </div>
          </div>
          <div className="enterprise-panel">
            <div className="panel-heading"><div><strong>전사 참고</strong><small>사업장 선택과 관계없는 원자료 요약</small></div><span>범위 구분</span></div>
            <div className="enterprise-grid">
              <div><small>2025 아차사고 최다</small><strong>{topNearMiss.type}</strong><span>{topNearMiss.values['2025']}건</span></div>
              <div><small>무재해 누적 최장</small><strong>{topZero.site}</strong><span>{number.format(topZero.cumulativeDays)}일</span></div>
              <div><small>5개 기지 정비대상</small><strong>{number.format(maintenanceTotal)}</strong><span>기·선좌</span></div>
              <div><small>유지보수 교육</small><strong>{validTraining.length}</strong><span>일정 확인</span></div>
            </div>
          </div>
        </div>

        <div className="manager-block">
          <div className="manager-heading"><div><span>선택 기준</span><h3>오늘 확인할 내용</h3></div><small>이 화면에 저장되지 않는 업무 참고안</small></div>
          <div className="action-list static-actions">
            <article className="action"><span className="action-number">01</span><strong>{mapping.excavation}</strong><span>굴착 확인</span><p>{branchRecords.length}건 중 3m 이내 {closeRecords.length}건과 EOCS 신고 여부 대조</p></article>
            <article className="action"><span className="action-number">02</span><strong>{mapping.emergency}</strong><span>장비 확인</span><p>{emergencyTypeCount(mapping.emergency)}종·{emergencySummary.quantity}대의 실제 사용 가능 상태 확인</p></article>
            <article className="action"><span className="action-number">03</span><strong>{site}</strong><span>{tasks[task].label}</span><p>{tasks[task].equipment[0]} 포함 준비장비와 현장 절차 교차 확인</p></article>
          </div>
        </div>
      </section>

      <section className="data-catalog">
        <div><p className="kicker"><span /> {allSources.length}종 · {number.format(sourceTotal)}건</p><h2>데이터 원문</h2><p className="catalog-note">모두 한국가스기술공사 공개데이터이며 기준일은 자료별로 다릅니다.</p></div>
        <div className="source-list">{allSources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.key}><span>0{index + 1}</span><strong>{source.name}</strong><em>{sourceDates[source.key]} · {number.format(source.rows)}건</em><i>↗</i></a>)}</div>
      </section>

      <footer><a className="brand" href="#today"><span className="brand-badge">ON</span><span>현장ON</span></a><CandidateNav active="control" compact /><span>한국가스기술공사 공개데이터 {allSources.length}종</span></footer>

      {briefingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setBriefingOpen(false)}><section className="briefing-modal" role="dialog" aria-modal="true" aria-labelledby="briefing-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setBriefingOpen(false)} aria-label="닫기">×</button><span className="modal-site">{site} · {tasks[task].label}</span><h2 id="briefing-title">작업 전 안전브리핑</h2><div className="script-step"><em>01</em><div><small>핵심 위험</small><strong>{tasks[task].hazard}</strong></div></div><div className="script-step"><em>02</em><div><small>우선 조치</small><strong>{tasks[task].action}</strong></div></div><div className="script-step"><em>03</em><div><small>작업중지 기준</small><strong>{tasks[task].stops.join(' · ')}</strong></div></div><p className="script-close">{tasks[task].briefing}<br />사업장 절차와 현장 책임자의 판단을 우선합니다.</p><div className="modal-actions"><button type="button" onClick={() => copyText(briefingText, 'briefing')}>{copied === 'briefing' ? '복사했습니다' : '내용 복사'}</button><button type="button" onClick={() => window.print()}>인쇄하기</button></div></section></div>}
    </main>
  );
}
