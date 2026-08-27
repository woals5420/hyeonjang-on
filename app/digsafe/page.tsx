'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import CandidateNav from '../components/CandidateNav';
import safetyData from '../data/kgtc-safety.json';
import excavationModel from '../data/excavation-model.json';
import eocsVolume from '../data/eocs-volume.json';

type RecordRow = { branch: string; category: string; date: string; area: string; work: string; distance: number };
type Data = {
  meta: { sources: { key: string; name: string; url: string }[] };
  excavation: { records: RecordRow[]; byBranch: Record<string, number> };
};
type Model = {
  trainRows: number;
  testRows: number;
  metrics: { accuracy: number; auc: number; brier: number };
  calibration: { priorStrength: number; globalBaseRate: number };
  features: { branches: string[]; works: string[] };
  weights: number[][][];
  biases: number[][];
};
type FieldConditions = { branch: string; work: string; month: number; distance: number };
type EocsRecord = { branch: string; '2019': number; '2020': number; '2021': number; '2022': number; '2023': number; '2024H1': number };
type EocsData = { source: { name: string; period: string; url: string }; records: EocsRecord[] };

const data = safetyData as Data;
const model = excavationModel as Model;
const eocs = eocsVolume as EocsData;
const excavationSource = data.meta.sources.find((source) => source.key === 'excavation');
const number = new Intl.NumberFormat('ko-KR');
const accents = ['#ffb23f', '#f76954', '#d99aff', '#50c8b8', '#69a7ff', '#f1d05a', '#7bd08f', '#ff8fbd', '#99b75e', '#8e92ff', '#42b9cf'];
const initialConditions: FieldConditions = { branch: '대전충청지사', work: '타공사_상수', month: 8, distance: 2 };

function layer(input: number[], weights: number[][], biases: number[], activate = true) {
  return biases.map((bias, output) => {
    const value = input.reduce((sum, item, index) => sum + item * weights[index][output], bias);
    return activate ? Math.max(0, value) : 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
  });
}

function neuralProbability(branch: string, work: string, month: number, distance: number) {
  const angle = Math.PI * 2 * (month - 1) / 12;
  const input = [
    ...model.features.branches.map((item) => item === branch ? 1 : 0),
    ...model.features.works.map((item) => item === work ? 1 : 0),
    Math.sin(angle), Math.cos(angle), 1,
    Math.log1p(Math.max(0, distance)) / Math.log(131),
    distance <= 1 ? 1 : 0,
    distance <= 3 ? 1 : 0,
    distance <= 5 ? 1 : 0,
    distance <= 10 ? 1 : 0,
  ];
  const hidden1 = layer(input, model.weights[0], model.biases[0]);
  const hidden2 = layer(hidden1, model.weights[1], model.biases[1]);
  return layer(hidden2, model.weights[2], model.biases[2], false)[0];
}

function distanceBand(distance: number) {
  if (distance <= 1) return { label: '1m 이내', matches: (value: number) => value <= 1 };
  if (distance <= 3) return { label: '1~3m', matches: (value: number) => value > 1 && value <= 3 };
  if (distance <= 5) return { label: '3~5m', matches: (value: number) => value > 3 && value <= 5 };
  if (distance <= 10) return { label: '5~10m', matches: (value: number) => value > 5 && value <= 10 };
  return { label: '10m 초과', matches: (value: number) => value > 10 };
}

function prediction(branch: string, work: string, month: number, distance: number) {
  const band = distanceBand(distance);
  const similar = data.excavation.records.filter((row) => row.branch === branch && row.work === work && band.matches(row.distance));
  const missed = similar.filter((row) => row.category === '미신고 굴착공사').length;
  const firstEstimate = neuralProbability(branch, work, month, distance);
  const prior = model.calibration.priorStrength;
  const adjusted = (firstEstimate * similar.length + model.calibration.globalBaseRate * prior) / (similar.length + prior);
  return { band, similar, missed, adjusted };
}

function actionLabel(value: number) {
  if (value >= 50) return '신고 여부 즉시 확인';
  if (value >= 30) return '우선 확인 후보';
  return '일반 확인';
}

function confidence(samples: number) {
  if (samples >= 20) return '높음';
  if (samples >= 8) return '보통';
  return '낮음';
}

function rate(rows: RecordRow[]) {
  return rows.length ? rows.filter((row) => row.category === '미신고 굴착공사').length / rows.length : 0;
}

function eocsContext(branch: string) {
  const comparableBranch = branch === '인천광역지사' ? '인천지사' : branch;
  const record = eocs.records.find((item) => item.branch === comparableBranch);
  const cases = record ? record['2019'] + record['2020'] + record['2021'] + record['2022'] + record['2023'] : 0;
  const missed = data.excavation.records.filter((row) => {
    const year = Number(row.date.slice(0, 4));
    return row.branch === comparableBranch && row.category === '미신고 굴착공사' && year >= 2019 && year <= 2023;
  }).length;
  return { cases, missed, perTenThousand: cases ? missed / cases * 10000 : 0 };
}

export default function DigSafe() {
  const [draft, setDraft] = useState<FieldConditions>(initialConditions);
  const [applied, setApplied] = useState<FieldConditions>(initialConditions);
  const { branch, work, month, distance } = applied;
  const hasChanges = draft.branch !== branch || draft.work !== work || draft.month !== month || draft.distance !== distance;

  const estimate = prediction(branch, work, month, distance);
  const probability = Math.round(estimate.adjusted * 100);
  const branchIndex = Math.max(0, model.features.branches.indexOf(branch));
  const branchRows = useMemo(() => data.excavation.records.filter((row) => row.branch === branch), [branch]);
  const workRows = useMemo(() => data.excavation.records.filter((row) => row.work === work), [work]);
  const closeRows = branchRows.filter((row) => row.distance <= 3);
  const branchEocs = eocsContext(branch);
  const workCounts = branchRows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.work]: (result[row.work] || 0) + 1 }), {});
  const topWorks = Object.entries(workCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const monthCounts = branchRows.reduce<number[]>((result, row) => {
    const parsedMonth = Number(row.date.split('-')[1]);
    if (parsedMonth) result[parsedMonth - 1] += 1;
    return result;
  }, Array(12).fill(0));
  const monthMax = Math.max(1, ...monthCounts);
  const patrol = model.features.branches.map((item) => {
    const itemEstimate = prediction(item, work, month, distance);
    return { branch: item, probability: Math.round(itemEstimate.adjusted * 100), samples: itemEstimate.similar.length, perTenThousand: eocsContext(item).perTenThousand };
  }).sort((a, b) => b.probability - a.probability || b.samples - a.samples);

  const selectPatrolBranch = (nextBranch: string) => {
    setApplied((current) => ({ ...current, branch: nextBranch }));
    setDraft((current) => ({ ...current, branch: nextBranch }));
  };

  return (
    <main className="digsafe-page" style={{ '--candidate-accent': accents[branchIndex % accents.length] } as CSSProperties}>
      <header className="candidate-header">
        <a className="candidate-brand" href="/"><span>ON</span>현장ON</a>
        <CandidateNav active="digsafe" compact />
        <small>한국가스기술공사 · 2026.05</small>
      </header>

      <section className="dz-hero">
        <div className="dz-title"><span>배관 보호</span><h1>굴착공사 관리</h1><p>공개된 굴착 예방활동 기록에서 입력 조건과 비슷한 사례를 찾고, 그 기록이 ‘미신고 굴착공사’ 유형일 가능성을 분류합니다.</p></div>
        <div className="dz-score" aria-live="polite"><span>{branch.replace('지사', '')} · 미신고 유형 분류확률</span><strong>{probability}</strong><em>%</em><small>{actionLabel(probability)} · 유사 기록 {estimate.similar.length}건</small></div>
      </section>

      <div className="page-howto"><strong>1 · 조건 입력</strong><span>관할·공사 종류·예정월·배관거리 선택</span><i>→</i><strong>2 · 결과 확인</strong><span>버튼을 누르면 분류확률과 지사 비교가 바뀝니다</span></div>

      <section className="dz-console">
        <form className="dz-inputs" onSubmit={(event) => { event.preventDefault(); setApplied({ ...draft }); }}>
          <div className="dz-section-title"><h2>현장 조건</h2><small>확인 버튼을 눌러 반영</small></div>
          <label>관할 지사<select value={draft.branch} onChange={(event) => setDraft((current) => ({ ...current, branch: event.target.value }))}>{model.features.branches.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>공사 종류<select value={draft.work} onChange={(event) => setDraft((current) => ({ ...current, work: event.target.value }))}>{model.features.works.map((item) => <option key={item} value={item}>{item.replace('타공사_', '')}</option>)}</select></label>
          <label>작업 예정월 <strong>{draft.month}월</strong><input aria-label="굴착 작업 예정월" type="range" min="1" max="12" value={draft.month} onChange={(event) => setDraft((current) => ({ ...current, month: Number(event.target.value) }))} /></label>
          <label>배관과 거리 <strong>{draft.distance}m</strong><input aria-label="굴착 위치와 배관 거리" type="range" min="0" max="20" step="0.5" value={draft.distance} onChange={(event) => setDraft((current) => ({ ...current, distance: Number(event.target.value) }))} /></label>
          <div className={hasChanges ? 'condition-submit pending-condition' : 'condition-submit'}>
            <p>{hasChanges ? '조건이 바뀌었습니다. 아래 버튼을 눌러 결과에 반영하세요.' : `${branch.replace('지사', '')} · ${work.replace('타공사_', '')} · ${month}월 · ${distance}m 조건을 표시하고 있습니다.`}</p>
            <button type="submit" disabled={!hasChanges}>{hasChanges ? '이 조건으로 결과 확인' : '현재 조건 반영 완료'}</button>
          </div>
          <div className="dz-action"><small>현재 결과에 따른 확인안</small><strong>{actionLabel(probability)}</strong><p>{distance <= 3 ? '배관 3m 이내입니다. EOCS 신고 여부와 현장 입회자를 먼저 확인합니다.' : '예정 작업 목록과 EOCS 신고 여부를 대조해 확인합니다.'}</p></div>
        </form>

        <div className="dz-network">
          <div className="dz-section-title"><h2>분류 결과</h2><small>과거 공개기록 기준</small></div>
          <p className="prediction-lead">입력 조건과 닮은 예방활동 기록이 ‘미신고 굴착공사’ 유형으로 분류될 확률은 <strong>{probability}%</strong>입니다.</p>
          <div className="probability-proof probability-proof-three">
            <div><small>유사 현장</small><strong>{estimate.similar.length}건 중 {estimate.missed}건</strong><p>같은 지사·공사 종류·{estimate.band.label} 기록</p></div>
            <div><small>전체 공개기록</small><strong>642건 중 181건</strong><p>미신고 유형 기록 {Math.round(model.calibration.globalBaseRate * 100)}%</p></div>
            <div className="proof-result"><small>근거 신뢰도</small><strong>{confidence(estimate.similar.length)}</strong><p>유사 현장 {estimate.similar.length}건을 기준으로 판단</p></div>
          </div>
          <p className="proof-formula"><b>산정 방식</b> 신경망이 지사·공사 종류·예정월·배관거리에서 만든 32개 분석항목을 계산합니다. 비슷한 기록이 적으면 전체 642건의 미신고 유형 비율을 함께 반영해 지나치게 높거나 낮은 결과를 줄입니다.</p>
          <div className="prediction-boundary"><span><b>예측 대상</b> 공개 예방활동 기록의 유형</span><span><b>예측하지 않음</b> 실제 굴착 건수·현장 신고 여부</span><span><b>최종 확인</b> EOCS 조회·현장 확인</span></div>
          <div className="model-metrics">
            <div><small>{branch.replace('지사', '')} 기록 중 미신고</small><strong>{Math.round(rate(branchRows) * 100)}%</strong></div>
            <div><small>{work.replace('타공사_', '')} 공사 중 미신고</small><strong>{Math.round(rate(workRows) * 100)}%</strong></div>
            <div><small>AI 학습 기록</small><strong>{model.trainRows}건</strong></div>
            <div><small>별도 검증 기록</small><strong>{model.testRows}건</strong></div>
          </div>
          <p className="model-note">3층 신경망(32→16→8→1)을 2019–2024년 기록으로 학습하고, 학습에 넣지 않은 2025–2026년 {model.testRows}건으로 따로 검증했습니다. 정확도 {(model.metrics.accuracy * 100).toFixed(1)}% · AUC {model.metrics.auc.toFixed(3)}입니다. 이 값은 전체 굴착공사의 실제 미신고 발생률이 아니라, 공개기록의 확인 순서를 정하는 참고값입니다.</p>
        </div>
      </section>

      <section className="dz-grid">
        <div className="patrol-board">
          <div className="dz-section-title"><h2>모델 확인 순위</h2><small>미신고 유형 분류확률 순</small></div>
          <p className="section-help">{work.replace('타공사_', '')} · {month}월 · 배관거리 {distance}m 조건을 모든 지사에 똑같이 적용했습니다. 지사를 누르면 상세 기록이 바뀝니다.</p>
          <div className="patrol-columns"><span>순서</span><span>지사</span><span>분류 막대</span><span>분류확률</span><span>민원 1만건당</span></div>
          {patrol.map((item, index) => <button key={item.branch} type="button" className={branch === item.branch ? 'selected-patrol' : ''} onClick={() => selectPatrolBranch(item.branch)}><em>{String(index + 1).padStart(2, '0')}</em><strong>{item.branch.replace('지사', '')}</strong><span><i style={{ width: `${item.probability}%` }} /></span><b>{item.probability}%</b><small>{item.perTenThousand.toFixed(1)}건</small></button>)}
        </div>

        <div className="branch-fingerprint">
          <div className="dz-section-title"><h2>관할 기록</h2><small>{branch.replace('지사', '')}</small></div>
          <div className="branch-kpis branch-kpis-four"><div><small>굴착 확인 기록</small><strong>{branchRows.length}</strong><em>건</em></div><div><small>배관 3m 이내</small><strong>{branchRows.length ? Math.round(closeRows.length / branchRows.length * 100) : 0}</strong><em>%</em></div><div><small>EOCS 처리량</small><strong>{number.format(branchEocs.cases)}</strong><em>건</em></div><div><small>민원 1만건당 미신고</small><strong>{branchEocs.perTenThousand.toFixed(1)}</strong><em>건</em></div></div>
          <p className="eocs-note">굴착 기록 수만 비교하면 업무량이 많은 지사가 크게 보입니다. 2019~2023년 EOCS 처리량을 함께 적용해 지사 규모 차이를 확인합니다. 자료별 지사명 차이는 같은 관할로 묶었습니다. {excavationSource && <a href={excavationSource.url} target="_blank" rel="noreferrer">굴착 기록 원문 ↗</a>} <a href={eocs.source.url} target="_blank" rel="noreferrer">EOCS 원문 ↗</a></p>
          <p className="metric-caption">이 지사의 월별 굴착 확인 건수</p>
          <div className="month-print">{monthCounts.map((count, index) => <div key={index} className={index + 1 === month ? 'active-month' : ''}><i style={{ height: `${Math.round(count / monthMax * 100)}%` }} /><small>{index + 1}</small></div>)}</div>
          <p className="metric-caption">이 지사에서 자주 확인한 공사 종류</p>
          <div className="work-print">{topWorks.map(([name, count], index) => <div key={name}><span>{String(index + 1).padStart(2, '0')}</span><strong>{name.replace('타공사_', '')}</strong><i style={{ width: `${Math.round(count / topWorks[0][1] * 100)}%` }} /><em>{count}</em></div>)}</div>
        </div>
      </section>

      <section className="dz-records">
        <div className="dz-section-title"><h2>최근 굴착 확인 기록</h2><small>{branch} 전체 {number.format(branchRows.length)}건</small></div>
        <div className="dz-table"><div className="dz-row dz-head"><span>확인일</span><span>지역</span><span>확인 결과</span><span>공사 종류</span><span>배관거리</span></div>{[...branchRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((row, index) => <div className="dz-row" key={`${row.date}-${index}`}><time>{row.date}</time><span>{row.area}</span><span>{row.category.replace('미신고 굴착공사 ', '')}</span><strong>{row.work.replace('타공사_', '')}</strong><em className={row.distance <= 3 ? 'close-distance' : ''}>{row.distance}m</em></div>)}</div>
      </section>
    </main>
  );
}
